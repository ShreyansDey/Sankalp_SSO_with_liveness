import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import ORG_NAME
from app.database import get_db
from app.deps import get_current_session
from app.models import ApiKey, SsoSession, SystemBootstrap, User
from app.schemas.integrations import BootstrapSuperuserRequest, ConfigurePrimaryKeyRequest
from app.security import (
    create_signed_ticket,
    generate_api_key,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/v1/setup", tags=["First-Time Superuser Bootstrap"])
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _get_bootstrap_row(db: Session) -> SystemBootstrap | None:
    return db.query(SystemBootstrap).filter(SystemBootstrap.id == "singleton").first()


@router.get("/status")
def get_setup_status(db: Session = Depends(get_db)):
    """Public check showing whether initial superuser bootstrap or primary key setup is needed."""
    admin_exists = db.query(User).filter(User.role == "admin", User.status != "deleted").first() is not None
    boot = _get_bootstrap_row(db)
    setup_completed = bool((boot and boot.setup_completed) or admin_exists)
    return {
        "org_name": ORG_NAME,
        "has_admin": admin_exists,
        "setup_completed": setup_completed,
        "needs_bootstrap": not setup_completed,
        "primary_key_configured": bool(boot and boot.primary_key_hash),
        "requires_bootstrap_credentials": bool(boot and boot.bootstrap_username and boot.bootstrap_password_hash),
    }


@router.post("/configure-primary-key")
def configure_primary_key(
    payload: ConfigurePrimaryKeyRequest,
    db: Session = Depends(get_db),
    session_obj: SsoSession | None = Depends(get_current_session),
):
    """
    Configure the user-chosen First-Time Superuser Creation Primary Key (and optional bootstrap username/password)
    while optionally minting an initial API key before/during first setup.
    """
    boot = _get_bootstrap_row(db)
    admin_exists = db.query(User).filter(User.role == "admin", User.status != "deleted").first() is not None

    # Security guard: if already configured or an admin already exists, require an active admin session
    if (boot and boot.primary_key_hash) or admin_exists:
        is_admin = False
        if session_obj:
            actor = db.query(User).filter(User.id == session_obj.user_id, User.status == "active").first()
            is_admin = bool(actor and actor.role == "admin")
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "already_configured",
                    "message": "Superuser primary key is already configured or an admin already exists.",
                },
            )

    if bool(payload.bootstrap_username) != bool(payload.bootstrap_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "incomplete_bootstrap_pair",
                "message": "Provide both bootstrap_username and bootstrap_password, or leave both blank.",
            },
        )

    if not boot:
        boot = SystemBootstrap(id="singleton")
        db.add(boot)

    boot.primary_key_hash = hash_password(payload.primary_key.strip())
    boot.bootstrap_username = payload.bootstrap_username.strip() if payload.bootstrap_username else None
    boot.bootstrap_password_hash = hash_password(payload.bootstrap_password) if payload.bootstrap_password else None

    response_data = {
        "status": "configured",
        "primary_key_configured": True,
        "requires_bootstrap_credentials": bool(boot.bootstrap_username),
        "message": "First-time superuser primary key saved cleanly.",
    }

    if payload.issue_api_key:
        raw_key, prefix, key_hash = generate_api_key()
        api_key = ApiKey(
            name=payload.api_key_name.strip(),
            key_prefix=prefix,
            key_hash=key_hash,
            scopes=payload.scopes,
            created_by=session_obj.user_id if session_obj else "setup_wizard",
        )
        db.add(api_key)
        response_data["api_key"] = raw_key
        response_data["key_prefix"] = prefix
        response_data["scopes"] = payload.scopes

    db.commit()
    log_audit(db, action="primary_key_configured", actor_id=session_obj.user_id if session_obj else "system")
    return response_data


@router.post("/bootstrap-superuser")
def bootstrap_superuser(
    payload: BootstrapSuperuserRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Create the very first Super Admin credential using the configured Primary Key
    (and bootstrap username/password if configured). Permanently locks itself after single use.
    """
    admin_exists = db.query(User).filter(User.role == "admin", User.status != "deleted").first() is not None
    boot = _get_bootstrap_row(db)

    if admin_exists or (boot and boot.setup_completed):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "setup_already_completed",
                "message": "First superuser bootstrap is permanently locked because an administrator already exists.",
            },
        )

    if not boot or not boot.primary_key_hash:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "primary_key_not_configured",
                "message": "Superuser Creation Primary Key has not been configured yet. Run scripts/generate_key.py or configure via Setup first.",
            },
        )

    if not verify_password(payload.primary_key.strip(), boot.primary_key_hash):
        log_audit(db, action="login_fail", actor_id="bootstrap", detail={"reason": "invalid_primary_key"})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_primary_key", "message": "Invalid First-Time Superuser Creation Primary Key"},
        )

    if boot.bootstrap_username and boot.bootstrap_password_hash:
        provided_user = (payload.bootstrap_username or "").strip()
        if provided_user != boot.bootstrap_username or not verify_password(
            payload.bootstrap_password or "", boot.bootstrap_password_hash
        ):
            log_audit(db, action="login_fail", actor_id="bootstrap", detail={"reason": "invalid_bootstrap_credentials"})
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": "invalid_bootstrap_credentials",
                    "message": "Invalid bootstrap username or password",
                },
            )

    email = payload.email.strip().lower()
    if not EMAIL_REGEX.match(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_email", "message": "Valid email address is required"},
        )

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "user_exists", "message": "An account with this email already exists"},
        )

    now = datetime.utcnow()
    # Atomic lock so concurrent bootstrap attempts cannot both succeed
    res = db.execute(
        update(SystemBootstrap)
        .where(SystemBootstrap.id == "singleton", SystemBootstrap.setup_completed.is_(False))
        .values(setup_completed=True, completed_at=now)
    )
    if res.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "setup_already_completed", "message": "Bootstrap lock already claimed"},
        )

    super_admin = User(
        email=email,
        name=payload.name.strip()[:255],
        password_hash=hash_password(payload.password),
        role="admin",
        status="active",
        last_active_at=now,
    )
    db.add(super_admin)
    db.flush()

    boot.completed_by = super_admin.id

    response_data = {
        "status": "ok",
        "user_id": super_admin.id,
        "email": super_admin.email,
        "role": super_admin.role,
        "next": "liveness",
        "login_ticket": create_signed_ticket(super_admin.id, purpose="liveness"),
        "message": "Super Admin account bootstrapped successfully. Complete liveness verification to access console.",
    }

    if payload.issue_api_key:
        raw_key, prefix, key_hash = generate_api_key()
        db.add(
            ApiKey(
                name=payload.api_key_name.strip(),
                key_prefix=prefix,
                key_hash=key_hash,
                scopes=["*"],
                created_by=super_admin.id,
            )
        )
        response_data["api_key"] = raw_key
        response_data["key_prefix"] = prefix

    db.commit()
    log_audit(
        db,
        action="superuser_bootstrapped",
        actor_id=super_admin.id,
        target_id=super_admin.id,
        detail={"email": super_admin.email, "ip": request.client.host if request.client else None},
    )
    return response_data
