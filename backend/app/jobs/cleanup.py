import os
from datetime import datetime, date, timedelta
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models import User, SsoSession, RefreshToken, RenewalRequest
from app.audit import log_audit
from app.config import INACTIVITY_DAYS, PURGE_GRACE_HOURS, FRONTEND_ORIGIN
from app.services.email_service import send_expired_email

def run_cleanup_job(db: Session) -> Dict[str, Any]:
    """
    M6/FR2: Runs automatic cleanup and 48-hour permanent purge.
    1. Disables accounts where:
       a. term_end is in the past (term_end < today)
       b. inactive for over INACTIVITY_DAYS (default 60 days)
       Immediately revokes all active SSO sessions and refresh tokens,
       logs 'user_disabled_auto', and sends 48-hour recovery/renewal email.
    2. 48-Hour Hard Purge:
       Permanently purges disabled user records and stored files from the database
       if 48 hours have elapsed since disabled_at without an approved renewal.
    """
    now = datetime.utcnow()
    today = date.today()
    inactivity_threshold = now - timedelta(days=INACTIVITY_DAYS)
    purge_threshold = now - timedelta(hours=PURGE_GRACE_HOURS)

    disabled_users = []
    purged_users = []

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

        # Send 48-hour expiration notice email with renew link
        renew_url = f"{FRONTEND_ORIGIN}/renew?email={user.email}"
        try:
            send_expired_email(user.email, user.name, renew_url, reason="term_end")
        except Exception:
            pass

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

        # Send 48-hour expiration notice email with renew link
        renew_url = f"{FRONTEND_ORIGIN}/renew?email={user.email}"
        try:
            send_expired_email(user.email, user.name, renew_url, reason="inactive")
        except Exception:
            pass

        disabled_users.append({
            "id": user.id,
            "email": user.email,
            "reason": "inactive"
        })

    db.commit()

    # 3. 48-Hour Hard Purge (Permanent Erasure)
    # Target all disabled users whose 48-hour window has expired and have no approved renewal
    eligible_for_purge = db.query(User).filter(
        User.status == "disabled",
        User.disabled_at.is_not(None),
        User.disabled_at <= purge_threshold
    ).all()

    for u in eligible_for_purge:
        # Check if an approved renewal exists
        has_approved = db.query(RenewalRequest).filter(
            RenewalRequest.user_id == u.id,
            RenewalRequest.status == "approved"
        ).first()

        if has_approved:
            continue

        user_email = u.email
        user_name = u.name
        user_id = u.id
        reason = u.disabled_reason or "disabled"

        # Remove physical document/face upload files from disk
        if u.face_photo_path and os.path.exists(u.face_photo_path):
            try:
                os.remove(u.face_photo_path)
            except Exception:
                pass

        if u.document_path and os.path.exists(u.document_path):
            try:
                os.remove(u.document_path)
            except Exception:
                pass

        # Log permanent purge to immutable audit log before deleting record
        log_audit(
            db,
            action="user_purged_permanently",
            actor_id="system_cleanup_job",
            target_id=user_id,
            detail={"email": user_email, "name": user_name, "reason": reason, "held_hours": PURGE_GRACE_HOURS}
        )

        # Hard delete user row (cascades to sessions, tokens, challenges, renewal_requests)
        db.delete(u)
        purged_users.append({
            "id": user_id,
            "email": user_email,
            "reason": reason
        })

    db.commit()

    return {
        "status": "ok",
        "processed_at": now.isoformat(),
        "total_disabled": len(disabled_users),
        "disabled_users": disabled_users,
        "total_purged": len(purged_users),
        "purged_users": purged_users
    }
