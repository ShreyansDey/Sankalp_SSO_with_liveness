from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import PURGE_GRACE_HOURS, resolve_frontend_origin
from app.database import get_db
from app.models import PasswordResetToken, RenewalRequest, SsoSession, User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
    SubmitRenewalRequest,
    VerifyResetTokenRequest,
)
from app.security import generate_random_token, hash_password, hash_token
from app.services.email_service import send_password_changed_email, send_password_reset_email

router = APIRouter(tags=["Recovery & Renewal"])


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Issue a 15-minute password reset link via email without leaking account existence."""
    email = (payload.email or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if user and user.status == "active":
        raw_token = generate_random_token(32)
        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        )
        db.add(reset_record)
        db.commit()

        origin = resolve_frontend_origin(request)
        reset_link = f"{origin}/reset-password?token={raw_token}"
        send_password_reset_email(
            to_email=user.email,
            name=user.name,
            reset_token=raw_token,
            reset_link=reset_link,
            background=True,
        )
        log_audit(db, action="password_reset_requested", actor_id=user.id, target_id=user.id)

    return {
        "status": "ok",
        "message": "If an active account exists for this email, a password reset link has been sent.",
    }


@router.post("/verify-reset-token")
def verify_reset_token(payload: VerifyResetTokenRequest, db: Session = Depends(get_db)):
    """Verify whether a password reset token is currently valid."""
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == hash_token(payload.token)).first()
    if not record or record.used_at is not None or record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_or_expired_token", "message": "This password reset link is invalid or has expired."},
        )
    user = db.query(User).filter(User.id == record.user_id).first()
    masked = ""
    if user and "@" in user.email:
        local, domain = user.email.split("@", 1)
        masked = f"{local[0]}***@{domain}" if local else f"***@{domain}"
    return {"status": "ok", "valid": True, "masked_email": masked, "message": "Token is valid"}


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Atomically consume reset token, update Argon2 hash, and revoke all existing sessions."""
    token_hashed = hash_token(payload.token)
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hashed).first()
    if not record or record.used_at is not None or record.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_or_expired_token", "message": "This password reset link is invalid or has expired."},
        )

    now = datetime.utcnow()
    res = db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.id == record.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    if res.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_or_expired_token", "message": "This password reset link has already been used."},
        )

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        db.rollback()
        raise HTTPException(status_code=404, detail={"error": "user_not_found"})

    user.password_hash = hash_password(payload.password)

    # Terminate every active session immediately on password change
    db.query(SsoSession).filter(SsoSession.user_id == user.id, SsoSession.revoked_at.is_(None)).update(
        {"revoked_at": now}
    )
    db.commit()

    log_audit(
        db,
        action="password_reset_completed",
        actor_id=user.id,
        target_id=user.id,
        detail={"ip": request.client.host if (request and request.client) else None},
    )

    send_password_changed_email(
        to_email=user.email,
        name=user.name,
        ip=request.client.host if (request and request.client) else "Unknown",
        user_agent=request.headers.get("user-agent", "Web Browser") if request else "Web Browser",
        background=True,
    )
    return {"status": "ok", "message": "Password reset successfully. All previous sessions have been terminated."}


@router.post("/renew")
@router.post("/renew-request")
def submit_renewal_request(payload: SubmitRenewalRequest, db: Session = Depends(get_db)):
    """Submit a 48-hour recovery/renewal appeal for a disabled account."""
    email = (payload.email or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "No account found with this email address."},
        )

    if user.status == "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "already_active", "message": "This account is already active and does not require renewal."},
        )

    if user.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "permanently_purged", "message": "This account has been permanently purged."},
        )

    if user.disabled_at:
        elapsed_hours = (datetime.utcnow() - user.disabled_at).total_seconds() / 3600.0
        if elapsed_hours > PURGE_GRACE_HOURS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "window_expired",
                    "message": "The 48-hour recovery window has expired; account is pending final purge.",
                },
            )

    existing_pending = (
        db.query(RenewalRequest)
        .filter(RenewalRequest.user_id == user.id, RenewalRequest.status == "pending")
        .first()
    )
    if existing_pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "request_pending", "message": "A renewal request is already pending administrator review."},
        )

    req = RenewalRequest(
        user_id=user.id,
        email=user.email,
        name=user.name,
        reason=(payload.reason or "").strip()[:2000],
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    log_audit(
        db,
        action="renewal_requested",
        actor_id=user.id,
        target_id=user.id,
        detail={"reason": req.reason, "disabled_reason": user.disabled_reason},
    )
    return {
        "status": "ok",
        "request_id": req.id,
        "request_status": "pending",
        "message": "Renewal request submitted successfully. An administrator will review your request shortly.",
    }
