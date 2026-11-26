from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import (
    IS_PRODUCTION,
    LIVENESS_CHALLENGE_TTL_SECONDS,
    ORG_NAME,
    SSO_SESSION_HOURS,
)
from app.database import get_db
from app.deps import get_current_session
from app.models import LivenessChallenge, SsoSession, User
from app.schemas.liveness import ChallengeRequest, ResultRequest
from app.security import (
    constant_time_compare,
    generate_liveness_code,
    hash_token,
    verify_signed_ticket,
)
from app.services.email_service import send_login_alert_email
from app.services.face_engine import (
    is_face_engine_ready,
    verify_live_face_against_candidates,
    verify_live_face_against_stored,
)

router = APIRouter(prefix="/liveness", tags=["Liveness"])
CHALLENGE_TYPES = ["blink", "turn_left", "turn_right"]


def _authorize_liveness_actor(
    payload_user_id: str | None,
    login_ticket: str | None,
    session_obj: SsoSession | None,
) -> str:
    """Resolve and strictly authorize which user_id may run liveness via signed ticket or session."""
    if login_ticket:
        ticket_payload = verify_signed_ticket(login_ticket, expected_purpose="liveness")
        if not ticket_payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "invalid_login_ticket", "message": "Login verification ticket is invalid or expired"},
            )
        ticket_uid = ticket_payload.get("sub")
        if payload_user_id and payload_user_id != ticket_uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "ticket_mismatch", "message": "Verification ticket does not match user"},
            )
        return ticket_uid

    if session_obj:
        if payload_user_id and payload_user_id != session_obj.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "session_mismatch", "message": "Active session does not match requested user"},
            )
        return session_obj.user_id

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": "login_ticket_required", "message": "Please complete credential verification before liveness check"},
    )


@router.post("/challenge")
def create_challenge(
    request: Request,
    payload: ChallengeRequest = ChallengeRequest(),
    db: Session = Depends(get_db),
    session_obj: SsoSession | None = Depends(get_current_session),
):
    """Issue a short-lived liveness challenge bound to a verified login ticket or active session."""
    user_id = _authorize_liveness_actor(payload.user_id, payload.login_ticket, session_obj)

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "User is missing or disabled"},
        )

    now = datetime.utcnow()
    window_start = now - timedelta(minutes=10)
    recent_attempts = (
        db.query(LivenessChallenge)
        .filter(LivenessChallenge.user_id == user.id, LivenessChallenge.expires_at > window_start)
        .count()
    )
    if recent_attempts >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "rate_limited", "message": "Too many liveness attempts. Please wait 10 minutes."},
        )

    challenge_type = CHALLENGE_TYPES[int.from_bytes(generate_liveness_code().encode("utf-8")[:2], "big") % len(CHALLENGE_TYPES)]
    raw_code = generate_liveness_code()
    expires_at = now + timedelta(seconds=LIVENESS_CHALLENGE_TTL_SECONDS)

    challenge = LivenessChallenge(
        user_id=user.id,
        type=challenge_type,
        code_hash=hash_token(raw_code),
        expires_at=expires_at,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    return {
        "challenge_id": challenge.id,
        "type": challenge.type,
        "code": raw_code,
        "expires_in": LIVENESS_CHALLENGE_TTL_SECONDS,
    }


@router.post("/result")
def submit_result(
    payload: ResultRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    session_obj: SsoSession | None = Depends(get_current_session),
):
    """
    Validate active liveness proof and fail-closed biometric identity match, then create SSO session.
    """
    challenge = db.query(LivenessChallenge).filter(LivenessChallenge.id == payload.challenge_id).first()
    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Challenge not found"},
        )

    _authorize_liveness_actor(challenge.user_id, payload.login_ticket, session_obj)

    if not constant_time_compare(hash_token(payload.code), challenge.code_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_code", "message": "Challenge verification code is invalid"},
        )

    now = datetime.utcnow()
    if challenge.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "challenge_expired", "message": "Challenge expired; please retry"},
        )

    # Atomically claim single-use challenge to block concurrent replays
    res = db.execute(
        update(LivenessChallenge)
        .where(LivenessChallenge.id == challenge.id, LivenessChallenge.used_at.is_(None))
        .values(used_at=now)
    )
    if res.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "challenge_used", "message": "Challenge has already been submitted"},
        )
    db.flush()

    user = db.query(User).filter(User.id == challenge.user_id).first()
    if not user or user.status != "active":
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "User is not active"},
        )

    if not payload.passed:
        challenge.result = "fail"
        db.commit()
        log_audit(
            db,
            action="liveness_fail",
            actor_id=user.id,
            target_id=user.id,
            detail={"type": challenge.type, "reason": payload.fail_reason or "check_failed"},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "status": "fail",
                "error": "liveness_failed",
                "message": "Camera check did not succeed. Please retry in good lighting.",
            },
        )

    # Collect authorized face embeddings
    candidates = []
    if user.admin_faces and isinstance(user.admin_faces, list):
        for profile in user.admin_faces:
            if isinstance(profile, dict) and profile.get("embedding"):
                candidates.append(profile["embedding"])
    if user.face_embedding and not candidates:
        candidates.append(user.face_embedding)

    must_verify_face = bool(user.require_face_match or candidates)
    face_score = None

    if must_verify_face:
        if not is_face_engine_ready():
            challenge.result = "fail"
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": "biometric_engine_unavailable",
                    "message": "Biometric verification engine is temporarily unavailable. Login aborted for security.",
                },
            )
        if not candidates:
            challenge.result = "fail"
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "face_not_enrolled",
                    "message": "Face lock is enabled on this account, but no enrolled face embedding exists.",
                },
            )
        if not payload.live_frame:
            challenge.result = "fail"
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "live_frame_required",
                    "message": "A live camera snapshot is required for biometric verification.",
                },
            )

        if len(candidates) == 1:
            matched, score, match_msg = verify_live_face_against_stored(payload.live_frame, candidates[0])
        else:
            matched, score, match_msg = verify_live_face_against_candidates(payload.live_frame, candidates)
        face_score = score
        if not matched:
            challenge.result = "face_mismatch"
            db.commit()
            log_audit(
                db,
                action="face_match_fail",
                actor_id=user.id,
                target_id=user.id,
                detail={"similarity_score": score, "reason": match_msg},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "status": "face_mismatch",
                    "error": "face_mismatch",
                    "confidence": score,
                    "message": f"Biometric verification failed: {match_msg}.",
                },
            )

    # Passed liveness and biometrics -> create SSO session
    challenge.result = "pass"
    user.liveness_passed_at = now
    user.last_active_at = now

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    new_session = SsoSession(
        user_id=user.id,
        expires_at=now + timedelta(hours=SSO_SESSION_HOURS),
        ip=client_ip,
        user_agent=user_agent,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    log_audit(
        db,
        action="liveness_pass",
        actor_id=user.id,
        target_id=user.id,
        detail={
            "type": challenge.type,
            "face_verified": must_verify_face,
            "similarity": face_score,
        },
    )

    send_login_alert_email(
        to_email=user.email,
        name=user.name,
        ip=client_ip or "Local Network",
        user_agent=user_agent or "Browser",
        org_name=ORG_NAME or "Jadavpur University Societies",
        background=True,
    )

    forwarded_proto = (request.headers.get("x-forwarded-proto") or "").lower()
    is_https = IS_PRODUCTION or request.url.scheme == "https" or forwarded_proto == "https"
    samesite_policy = "none" if is_https else "lax"

    response.set_cookie(
        key="sso_session",
        value=new_session.id,
        httponly=True,
        max_age=SSO_SESSION_HOURS * 3600,
        path="/",
        samesite=samesite_policy,
        secure=is_https,
    )

    return {
        "status": "ok",
        "passed": True,
        "session_id": new_session.id,
        "face_matched": True,
        "confidence": face_score,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
        },
        "message": "Live verification passed! Signed into central SSO.",
    }
