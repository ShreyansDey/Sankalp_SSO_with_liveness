import os
from datetime import datetime, date, timedelta
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.models import User, SsoSession, RefreshToken, AuditLog, RenewalRequest
from app.audit import log_audit
from app.config import INACTIVITY_DAYS, PURGE_GRACE_HOURS, FRONTEND_ORIGIN
from app.services.email_service import (
    send_account_expired_email,
    send_expiry_warning_email,
    send_expired_email,
    send_final_purge_takeout_email
)

def run_cleanup_job(db: Session) -> Dict[str, Any]:
    """
    M6/FR2: Runs automatic cleanup and 48-hour permanent purge.
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

        # Dispatch access concluded email to student
        send_account_expired_email(
            to_email=user.email,
            name=user.name,
            reason="term_end",
            background=True
        )
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

        # Dispatch inactivity access concluded email
        send_account_expired_email(
            to_email=user.email,
            name=user.name,
            reason="inactive",
            background=True
        )
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
            AuditLog.at >= now - timedelta(days=2)
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

        # Prepare personal data export takeout prior to hard purge
        user_data = {
            "name": user_name,
            "email": user_email,
            "phone": u.phone,
            "created_at": u.created_at,
            "disabled_at": u.disabled_at,
            "disabled_reason": reason,
        }

        # Send final data takeout email with complete record summary and re-registration notice
        try:
            send_final_purge_takeout_email(user_email, user_data, background=False)
        except Exception:
            pass

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
        "warnings_sent": warnings_sent,
        "total_purged": len(purged_users),
        "purged_users": purged_users
    }
