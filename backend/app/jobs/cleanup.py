from datetime import datetime, date, timedelta
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models import User, SsoSession, RefreshToken, AuditLog
from app.audit import log_audit
from app.config import INACTIVITY_DAYS
from app.services.email_service import (
    send_account_expired_email,
    send_expiry_warning_email
)

def run_cleanup_job(db: Session) -> Dict[str, Any]:
    """
    M6/FR2: Runs automatic cleanup.
    Disables accounts where:
    1. term_end is in the past (term_end < today)
    2. inactive for over INACTIVITY_DAYS (default 60 days)
    Immediately revokes all active SSO sessions and refresh tokens for disabled users.
    Sends notification emails and logs audit events.
    Also dispatches 48h-72h advance expiry warning emails to active members.
    """
    now = datetime.utcnow()
    today = date.today()
    inactivity_threshold = now - timedelta(days=INACTIVITY_DAYS)

    disabled_users = []

    # 1. Check expired term end
    expired_term_users = db.query(User).filter(
        User.status == "active",
        User.term_end.is_not(None),
        User.term_end < today
    ).all()

    for user in expired_term_users:
        user.status = "disabled"
        user.disabled_reason = "term_end"
        user.disabled_at = now

        # Revoke SSO sessions
        db.query(SsoSession).filter(
            SsoSession.user_id == user.id,
            SsoSession.revoked_at.is_(None)
        ).update({"revoked_at": now})

        # Revoke refresh tokens
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None)
        ).update({"revoked_at": now})

        log_audit(
            db,
            action="user_disabled_auto",
            actor_id="system_cleanup_job",
            target_id=user.id,
            detail={"reason": "term_end", "term_end": str(user.term_end)}
        )

        # Dispatch access concluded email to student
        send_account_expired_email(
            to_email=user.email,
            name=user.name,
            reason="term_end",
            background=True
        )

        disabled_users.append({
            "id": user.id,
            "email": user.email,
            "reason": "term_end"
        })

    # 2. Check inactivity
    inactive_users = db.query(User).filter(
        User.status == "active",
        User.created_at < inactivity_threshold,
        (User.last_active_at < inactivity_threshold) | (User.last_active_at.is_(None))
    ).all()

    for user in inactive_users:
        user.status = "disabled"
        user.disabled_reason = "inactive"
        user.disabled_at = now

        # Revoke SSO sessions
        db.query(SsoSession).filter(
            SsoSession.user_id == user.id,
            SsoSession.revoked_at.is_(None)
        ).update({"revoked_at": now})

        # Revoke refresh tokens
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None)
        ).update({"revoked_at": now})

        log_audit(
            db,
            action="user_disabled_auto",
            actor_id="system_cleanup_job",
            target_id=user.id,
            detail={"reason": "inactive", "days_threshold": INACTIVITY_DAYS}
        )

        # Dispatch inactivity access concluded email
        send_account_expired_email(
            to_email=user.email,
            name=user.name,
            reason="inactive",
            background=True
        )

        disabled_users.append({
            "id": user.id,
            "email": user.email,
            "reason": "inactive"
        })

    # 3. Check upcoming term expiry (48h - 72h advance courtesy reminder)
    warning_horizon = today + timedelta(days=3)
    upcoming_users = db.query(User).filter(
        User.status == "active",
        User.term_end.is_not(None),
        User.term_end >= today,
        User.term_end <= warning_horizon
    ).all()

    warnings_sent = 0
    for user in upcoming_users:
        days_left = (user.term_end - today).days
        # Avoid spamming: only send once per 2-day period
        recent_warning = db.query(AuditLog).filter(
            AuditLog.target_id == user.id,
            AuditLog.action == "expiry_warning_sent",
            AuditLog.created_at >= now - timedelta(days=2)
        ).first()

        if not recent_warning:
            send_expiry_warning_email(
                to_email=user.email,
                name=user.name,
                term_end_str=str(user.term_end),
                days_left=days_left,
                background=True
            )
            log_audit(
                db,
                action="expiry_warning_sent",
                actor_id="system_cleanup_job",
                target_id=user.id,
                detail={"term_end": str(user.term_end), "days_left": days_left}
            )
            warnings_sent += 1

    db.commit()

    return {
        "status": "ok",
        "processed_at": now.isoformat(),
        "total_disabled": len(disabled_users),
        "disabled_users": disabled_users,
        "warnings_sent": warnings_sent
    }
