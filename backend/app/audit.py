from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models import AuditLog

# Fixed list of valid audit actions according to data-model.md
VALID_AUDIT_ACTIONS = {
    "invite_created",
    "signup",
    "signup_consent_granted",
    "login_ok",
    "login_fail",
    "liveness_pass",
    "liveness_fail",
    "token_issued",
    "token_introspected",
    "token_revoked",
    "access_denied",
    "user_marked_left",
    "user_disabled_auto",
    "user_enabled",
    "delete_requested",
    "delete_approved",
    "product_registered",
    "app_secret_rotated",
    "app_deleted",
    "application_submitted",
    "application_approved",
    "application_rejected",
    "face_match_fail",
    "password_reset_requested",
    "password_reset_completed",
    "renewal_requested",
    "renewal_approved",
    "renewal_declined",
    "expiry_warning_sent",
    "user_purged_permanently",
    "admin_face_enrolled",
    "admin_face_deleted",
    "admin_face_restriction_toggled",
    "primary_key_configured",
    "superuser_bootstrapped",
    "api_key_created",
    "api_key_revoked",
    "integration_user_revoked",
    "otp_requested",
    "otp_failed",
}


def log_audit(
    db: Session,
    action: str,
    actor_id: Optional[str] = None,
    target_id: Optional[str] = None,
    detail: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    """
    Log an audit event strictly matching the fixed action list.
    Sanitizes detail to guarantee no secrets, passwords, OTPs, or tokens are logged.
    """
    if action not in VALID_AUDIT_ACTIONS:
        raise ValueError(f"Action '{action}' is not in the fixed audit actions list")

    sanitized_detail = None
    if detail:
        sanitized_detail = {}
        for k, v in detail.items():
            if any(
                forbidden in k.lower()
                for forbidden in ["password", "token", "secret", "code", "hash", "otp", "api_key", "primary_key"]
            ):
                continue
            sanitized_detail[k] = v

    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_id=target_id,
        detail=sanitized_detail,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
