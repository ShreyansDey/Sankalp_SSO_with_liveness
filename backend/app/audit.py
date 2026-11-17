from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models import AuditLog

# Fixed list of valid audit actions according to data-model.md
VALID_AUDIT_ACTIONS = {
    "invite_created",
    "signup",
    "login_ok",
    "login_fail",
    "liveness_pass",
    "liveness_fail",
    "token_issued",
    "access_denied",
    "user_marked_left",
    "user_disabled_auto",
    "user_enabled",
    "delete_requested",
    "delete_approved",
    "product_registered"
}

def log_audit(
    db: Session,
    action: str,
    actor_id: Optional[str] = None,
    target_id: Optional[str] = None,
    detail: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """
    Log an audit event strictly matching the fixed action list.
    Sanitizes detail to guarantee no secrets, passwords, or tokens are logged.
    """
    if action not in VALID_AUDIT_ACTIONS:
        raise ValueError(f"Action '{action}' is not in the fixed audit actions list")

    sanitized_detail = None
    if detail:
        sanitized_detail = {}
        for k, v in detail.items():
            # Guarantee no sensitive fields are logged
            if any(forbidden in k.lower() for forbidden in ["password", "token", "secret", "code", "hash"]):
                continue
            sanitized_detail[k] = v

    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_id=target_id,
        detail=sanitized_detail
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
