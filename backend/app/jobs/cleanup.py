import logging
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import FRONTEND_ORIGIN, INACTIVITY_DAYS, ORG_NAME, PURGE_GRACE_HOURS
from app.database import SessionLocal
from app.models import AuditLog, RefreshToken, RenewalRequest, SsoSession, User
from app.services.email_service import (
    send_expired_email,
    send_expiry_warning_email,
    send_final_purge_takeout_email,
)
from app.services.storage_service import erase_user_files

logger = logging.getLogger("sankalp.cleanup")


def run_cleanup_job(db: Session | None = None) -> dict:
    """
    Automatic lifecycle remediation & DPDP data reduction janitor:
    1) Advance 3-day expiry warning emails (once per user).
    2) Disable users past term_end (single consolidated notification, atomic session revocation).
    3) Disable inactive users past INACTIVITY_DAYS.
    4) Permanently hard-purge disabled accounts past PURGE_GRACE_HOURS (unless renewed AFTER disable)
       with file unlinking, takeout export email, and anonymized audit trail.
    """
    owns_db = False
    if db is None:
        db = SessionLocal()
        owns_db = True

    try:
        today = date.today()
        now = datetime.utcnow()
        inactivity_cutoff = now - timedelta(days=INACTIVITY_DAYS)
        purge_cutoff = now - timedelta(hours=PURGE_GRACE_HOURS)
        warn_cutoff = today + timedelta(days=3)

        warned_count = 0
        disabled_term = 0
        disabled_inactive = 0
        purged_count = 0
        purged_users = []
        revoked_sessions = 0
        revoked_tokens = 0
        unlinked_files = 0

        active_users = db.query(User).filter(User.status == "active").all()
        for u in active_users:
            if u.term_end and today < u.term_end <= warn_cutoff:
                already_warned = (
                    db.query(AuditLog)
                    .filter(AuditLog.action == "expiry_warning_sent", AuditLog.target_id == u.id)
                    .first()
                )
                if not already_warned:
                    days_left = (u.term_end - today).days
                    send_expiry_warning_email(
                        to_email=u.email,
                        name=u.name,
                        term_end_str=u.term_end.isoformat(),
                        days_left=days_left,
                        org_name=ORG_NAME or "Jadavpur University Societies",
                        role=u.role.capitalize(),
                        background=True,
                    )
                    log_audit(
                        db,
                        action="expiry_warning_sent",
                        actor_id="system",
                        target_id=u.id,
                        detail={"term_end": u.term_end.isoformat(), "days_left": days_left},
                    )
                    warned_count += 1

            if u.term_end and u.term_end < today:
                u.status = "disabled"
                u.disabled_at = now
                u.disabled_reason = "term_end"
                revoked_sessions += (
                    db.query(SsoSession)
                    .filter(SsoSession.user_id == u.id, SsoSession.revoked_at.is_(None))
                    .update({"revoked_at": now})
                )
                revoked_tokens += (
                    db.query(RefreshToken)
                    .filter(RefreshToken.user_id == u.id, RefreshToken.revoked_at.is_(None))
                    .update({"revoked_at": now})
                )
                db.commit()
                log_audit(
                    db,
                    action="user_disabled_auto",
                    actor_id="system",
                    target_id=u.id,
                    detail={"reason": "term_end", "term_end": u.term_end.isoformat()},
                )
                send_expired_email(
                    to_email=u.email,
                    name=u.name,
                    renew_url=f"{FRONTEND_ORIGIN}/renew?email={u.email}",
                    reason="term_end",
                    background=True,
                )
                disabled_term += 1
                continue

            if u.role != "admin":
                ref_time = u.last_active_at or u.created_at
                if ref_time and ref_time < inactivity_cutoff:
                    u.status = "disabled"
                    u.disabled_at = now
                    u.disabled_reason = "inactive"
                    revoked_sessions += (
                        db.query(SsoSession)
                        .filter(SsoSession.user_id == u.id, SsoSession.revoked_at.is_(None))
                        .update({"revoked_at": now})
                    )
                    revoked_tokens += (
                        db.query(RefreshToken)
                        .filter(RefreshToken.user_id == u.id, RefreshToken.revoked_at.is_(None))
                        .update({"revoked_at": now})
                    )
                    db.commit()
                    log_audit(
                        db,
                        action="user_disabled_auto",
                        actor_id="system",
                        target_id=u.id,
                        detail={"reason": "inactive", "last_active_at": ref_time.isoformat()},
                    )
                    send_expired_email(
                        to_email=u.email,
                        name=u.name,
                        renew_url=f"{FRONTEND_ORIGIN}/renew?email={u.email}",
                        reason="inactive",
                        background=True,
                    )
                    disabled_inactive += 1

        # 48-hour hard purge for disabled users without an active/recent renewal override
        purge_candidates = (
            db.query(User)
            .filter(
                User.status == "disabled",
                User.role != "admin",
                User.disabled_at.isnot(None),
                User.disabled_at < purge_cutoff,
            )
            .all()
        )
        for u in purge_candidates:
            has_recent_approved = (
                db.query(RenewalRequest)
                .filter(
                    RenewalRequest.user_id == u.id,
                    RenewalRequest.status == "approved",
                    RenewalRequest.resolved_at >= u.disabled_at,
                )
                .first()
            )
            has_pending = (
                db.query(RenewalRequest)
                .filter(
                    RenewalRequest.user_id == u.id,
                    RenewalRequest.status == "pending",
                    RenewalRequest.created_at >= u.disabled_at,
                )
                .first()
            )
            if has_recent_approved or has_pending:
                continue

            snapshot = {
                "name": u.name,
                "email": u.email,
                "phone": u.phone,
                "created_at": u.created_at,
                "disabled_at": u.disabled_at,
                "disabled_reason": u.disabled_reason,
            }
            send_final_purge_takeout_email(to_email=u.email, user_data=snapshot, background=True)
            unlinked_files += erase_user_files(u.document_path, u.face_photo_path)

            uid_copy = u.id
            reason_copy = u.disabled_reason
            db.delete(u)
            db.commit()

            log_audit(
                db,
                action="user_purged_permanently",
                actor_id="system",
                target_id=uid_copy,
                detail={
                    "email": snapshot["email"],
                    "reason": reason_copy,
                    "held_hours": PURGE_GRACE_HOURS,
                    "takeout_dispatched": True,
                },
            )
            purged_count += 1
            purged_users.append({"id": uid_copy, "email": snapshot["email"], "reason": reason_copy})

        return {
            "status": "ok",
            "total_disabled": disabled_term + disabled_inactive,
            "total_purged": purged_count,
            "purged_users": purged_users,
            "disabled_term_end": disabled_term,
            "disabled_inactive": disabled_inactive,
            "warnings_sent": warned_count,
            "purged_permanently": purged_count,
            "revoked_sessions": revoked_sessions,
            "revoked_tokens": revoked_tokens,
            "unlinked_files": unlinked_files,
            "ran_at": now.isoformat(),
        }
    finally:
        if owns_db:
            db.close()
