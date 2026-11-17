from datetime import datetime, date, timedelta
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models import User, SsoSession, RefreshToken
from app.audit import log_audit
from app.config import INACTIVITY_DAYS

def run_cleanup_job(db: Session) -> Dict[str, Any]:
    """
    M6/FR2: Runs automatic cleanup.
    Disables accounts where:
    1. term_end is in the past (term_end < today)
    2. inactive for over INACTIVITY_DAYS (default 60 days)
    Immediately revokes all active SSO sessions and refresh tokens for disabled users.
    Logs 'user_disabled_auto' for each disabled user.
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
        disabled_users.append({
            "id": user.id,
            "email": user.email,
            "reason": "inactive"
        })

    db.commit()

    return {
        "status": "ok",
        "processed_at": now.isoformat(),
        "total_disabled": len(disabled_users),
        "disabled_users": disabled_users
    }
