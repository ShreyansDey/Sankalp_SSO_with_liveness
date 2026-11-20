import random
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, LivenessChallenge, SsoSession
from app.security import (
    hash_token,
    generate_liveness_code,
    generate_random_token
)
from app.audit import log_audit
from app.config import SSO_SESSION_HOURS, IS_PRODUCTION
from app.deps import get_current_session

router = APIRouter(prefix="/liveness", tags=["liveness"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
FACES_DIR = UPLOAD_DIR / "faces"

from app.services.face_engine import (
    verify_live_face_against_stored,
    extract_face_embedding,
    is_face_engine_ready
)

CHALLENGE_TYPES = ["turn_left", "turn_right"]

from app.schemas.liveness import ChallengeRequest, ResultRequest

@router.post("/challenge")
def create_challenge(
    payload: ChallengeRequest,
    request: Request,
    db: Session = Depends(get_db),
    existing_session: Optional[SsoSession] = Depends(get_current_session)
):
    """
    FR5/M3: Request a random liveness challenge.
    Returns challenge id, type, one-time code, expires_in 30.
    Rate limited to max 5 challenges per 10 minutes per user.
    """
    user_id = payload.user_id
    if not user_id and existing_session:
        user_id = existing_session.user_id

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "missing_user", "message": "user_id is required"}
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "User is not active"}
        )

    # Rate limiting: max 5 challenges per 10 minutes
    ten_minutes_ago = datetime.utcnow() - timedelta(minutes=10)
    recent_count = db.query(LivenessChallenge).filter(
        LivenessChallenge.user_id == user_id,
        LivenessChallenge.expires_at > ten_minutes_ago
    ).count()

    if recent_count >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "rate_limited", "message": "Too many liveness challenges. Maximum 5 per 10 minutes."}
        )

    challenge_type = random.choice(CHALLENGE_TYPES)
    raw_code = generate_liveness_code()
    code_h = hash_token(raw_code)
    expires_at = datetime.utcnow() + timedelta(seconds=30)

    # Clean up older abandoned uncompleted challenges for this user past the rate limit window
    db.query(LivenessChallenge).filter(
        LivenessChallenge.user_id == user_id,
        LivenessChallenge.expires_at < ten_minutes_ago,
        LivenessChallenge.used_at.is_(None)
    ).delete(synchronize_session=False)

    challenge = LivenessChallenge(
        user_id=user_id,
        type=challenge_type,
        code_hash=code_h,
        expires_at=expires_at,
        used_at=None,
        result=None
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    return {
        "challenge_id": challenge.id,
        "type": challenge.type,
        "code": raw_code,
        "expires_in": 30
    }

@router.post("/result")
def submit_result(
    payload: ResultRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    FR5: Verify liveness challenge result.
    Checks code is unused and not expired.
    On pass: sets HttpOnly sso_session cookie and updates liveness_passed_at.
    """
    challenge = db.query(LivenessChallenge).filter(LivenessChallenge.id == payload.challenge_id).first()
    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "challenge_not_found", "message": "Challenge not found"}
        )

    if challenge.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "challenge_used", "message": "Challenge code has already been used"}
        )

    if challenge.expires_at < datetime.utcnow():
        challenge.used_at = datetime.utcnow()
        challenge.result = "fail"
        db.commit()
        log_audit(
            db,
            action="liveness_fail",
            actor_id=challenge.user_id,
            target_id=challenge.id,
            detail={"reason": "expired"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "challenge_expired", "message": "Challenge has expired (must complete in 30 seconds)"}
        )

    # Verify code hash
    if hash_token(payload.code) != challenge.code_hash:
        challenge.used_at = datetime.utcnow()
        challenge.result = "fail"
        db.commit()
        log_audit(
            db,
            action="liveness_fail",
            actor_id=challenge.user_id,
            target_id=challenge.id,
            detail={"reason": "code_mismatch"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_code", "message": "Invalid challenge code"}
        )

    user = db.query(User).filter(User.id == challenge.user_id).first()
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "User is not active"}
        )

    challenge.used_at = datetime.utcnow()

    if not payload.passed:
        challenge.result = "fail"
        db.commit()
        log_audit(
            db,
            action="liveness_fail",
            actor_id=user.id,
            target_id=challenge.id,
            detail={"type": challenge.type, "client_reported": False}
        )
        return {
            "status": "fail",
            "passed": False,
            "message": "Liveness check failed"
        }

    # Liveness passed!
    # Check biometric face match if user has an enrolled face embedding
    face_matched = False
    match_score = None

    # Step A: If user has no embedding yet, auto-extract from saved registration snapshot
    if not user.face_embedding and is_face_engine_ready():
        photo_path = FACES_DIR / f"{user.id}.jpg"
        if photo_path.exists():
            saved_emb = extract_face_embedding(str(photo_path))
            if saved_emb:
                user.face_embedding = saved_emb
                db.commit()
                db.refresh(user)

    # Step B: Strict 1:1 Face Match against enrolled face profile
    if user.face_embedding:
        if not payload.live_frame:
            challenge.result = "fail"
            db.commit()
            log_audit(
                db,
                action="face_match_fail",
                actor_id=user.id,
                target_id=challenge.id,
                detail={"score": 0.0, "reason": "No live camera frame provided for face match"}
            )
            return {
                "status": "fail",
                "passed": False,
                "error": "face_mismatch",
                "message": "Live camera frame required for biometric face authentication."
            }

        if is_face_engine_ready():
            is_match, score, msg = verify_live_face_against_stored(payload.live_frame, user.face_embedding)
            match_score = score
            if not is_match:
                challenge.result = "fail"
                db.commit()
                log_audit(
                    db,
                    action="face_match_fail",
                    actor_id=user.id,
                    target_id=challenge.id,
                    detail={"score": score, "reason": msg}
                )
                return {
                    "status": "fail",
                    "passed": False,
                    "error": "face_mismatch",
                    "message": "Physical presence confirmed, but face does not match the registered member account profile."
                }
            face_matched = True
        else:
            face_matched = True

    # Step C: First login for accounts without prior photo: enroll live face now
    elif payload.live_frame and is_face_engine_ready():
        emb = extract_face_embedding(payload.live_frame)
        if emb is None:
            challenge.result = "fail"
            db.commit()
            log_audit(
                db,
                action="liveness_fail",
                actor_id=user.id,
                target_id=challenge.id,
                detail={"reason": "no_face_in_live_frame"}
            )
            return {
                "status": "fail",
                "passed": False,
                "error": "face_not_detected",
                "message": "No clear human face detected in the live camera frame."
            }
        # Enrol this face so all subsequent logins are locked to this person
        user.face_embedding = emb
        db.commit()
        db.refresh(user)
        face_matched = True

    challenge.result = "pass"
    user.liveness_passed_at = datetime.utcnow()
    user.last_active_at = datetime.utcnow()

    # Create SSO Session
    session_expires = datetime.utcnow() + timedelta(hours=SSO_SESSION_HOURS)
    sso_sess = SsoSession(
        user_id=user.id,
        created_at=datetime.utcnow(),
        expires_at=session_expires,
        revoked_at=None,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    db.add(sso_sess)
    db.commit()
    db.refresh(sso_sess)

    # Set HttpOnly session cookie
    response.set_cookie(
        key="sso_session",
        value=sso_sess.id,
        httponly=True,
        samesite="lax",
        secure=IS_PRODUCTION,
        max_age=SSO_SESSION_HOURS * 3600,
        path="/"
    )

    log_audit(
        db,
        action="liveness_pass",
        actor_id=user.id,
        target_id=challenge.id,
        detail={"type": challenge.type, "face_matched": face_matched, "similarity_score": match_score}
    )

    log_audit(
        db,
        action="login_ok",
        actor_id=user.id,
        target_id=user.id,
        detail={"session_id": sso_sess.id, "via": "liveness"}
    )

    return {
        "status": "ok",
        "passed": True,
        "session_id": sso_sess.id,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role
        }
    }
