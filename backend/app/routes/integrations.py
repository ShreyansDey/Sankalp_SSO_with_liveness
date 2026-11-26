from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.database import get_db
from app.deps import AdminOrApiPrincipal, require_admin_or_api_key
from app.models import ApiKey, AuditLog, Product, RefreshToken, SsoSession, SystemBootstrap, User
from app.schemas.integrations import (
    CreateApiKeyRequest,
    IntegrationAppCreateRequest,
    VerifyTokenPayload,
)
from app.security import (
    decode_access_token,
    generate_api_key,
    generate_random_token,
    hash_password,
    hash_token,
)

router = APIRouter(prefix="/api/v1", tags=["Universal SSO Integration API"])


@router.get("/integrations/discovery")
def integration_discovery(request: Request):
    """Describe Universal SSO API endpoints, headers, and quick-start integration contract."""
    base_url = str(request.base_url).rstrip("/")
    return {
        "system": "Sankalp SSO (Real Person, Real Access)",
        "version": "2.0.0",
        "auth_header": "X-API-Key: sk_live_...",
        "oidc_discovery_url": f"{base_url}/.well-known/openid-configuration",
        "endpoints": {
            "setup_status": f"{base_url}/api/v1/setup/status",
            "configure_primary_key": f"{base_url}/api/v1/setup/configure-primary-key",
            "bootstrap_superuser": f"{base_url}/api/v1/setup/bootstrap-superuser",
            "manage_keys": f"{base_url}/api/v1/keys",
            "register_app": f"{base_url}/api/v1/integrations/apps",
            "verify_token": f"{base_url}/api/v1/integrations/users/verify-token",
            "revoke_user": f"{base_url}/api/v1/integrations/users/{{user_id}}/revoke",
            "audit_feed": f"{base_url}/api/v1/integrations/audit",
            "reports": f"{base_url}/api/v1/reports",
        },
        "available_scopes": ["sso:read", "sso:write", "apps:manage", "audit:read", "*"],
    }


@router.post("/keys")
def create_api_key(
    payload: CreateApiKeyRequest,
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("apps:manage")),
):
    """Create a scoped Integration API key, optionally configuring an uninitialized primary bootstrap key."""
    raw_key, prefix, key_hash = generate_api_key()
    expires_at = (
        datetime.utcnow() + timedelta(days=payload.expires_in_days) if payload.expires_in_days else None
    )

    api_key = ApiKey(
        name=payload.name.strip(),
        key_prefix=prefix,
        key_hash=key_hash,
        scopes=payload.scopes,
        created_by=principal.actor_id,
        expires_at=expires_at,
    )
    db.add(api_key)

    primary_key_updated = False
    if payload.superuser_primary_key:
        boot = db.query(SystemBootstrap).filter(SystemBootstrap.id == "singleton").first()
        if boot and boot.setup_completed:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "setup_completed", "message": "Cannot overwrite primary key after setup completion."},
            )
        if not boot:
            boot = SystemBootstrap(id="singleton")
            db.add(boot)
        boot.primary_key_hash = hash_password(payload.superuser_primary_key.strip())
        if payload.bootstrap_username and payload.bootstrap_password:
            boot.bootstrap_username = payload.bootstrap_username.strip()
            boot.bootstrap_password_hash = hash_password(payload.bootstrap_password)
        primary_key_updated = True

    db.commit()
    db.refresh(api_key)

    log_audit(
        db,
        action="api_key_created",
        actor_id=principal.actor_id,
        target_id=api_key.id,
        detail={"name": api_key.name, "scopes": api_key.scopes, "primary_key_set": primary_key_updated},
    )

    return {
        "id": api_key.id,
        "name": api_key.name,
        "api_key": raw_key,
        "key_prefix": prefix,
        "scopes": api_key.scopes,
        "expires_at": api_key.expires_at.isoformat() if api_key.expires_at else None,
        "primary_key_configured": primary_key_updated,
        "message": "Store this API key safely; it will only be displayed once.",
    }


@router.get("/keys")
def list_api_keys(
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("sso:read")),
):
    keys = db.query(ApiKey).order_by(ApiKey.created_at.desc()).all()
    return [
        {
            "id": k.id,
            "name": k.name,
            "key_prefix": k.key_prefix,
            "scopes": k.scopes,
            "created_at": k.created_at.isoformat(),
            "expires_at": k.expires_at.isoformat() if k.expires_at else None,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            "revoked_at": k.revoked_at.isoformat() if k.revoked_at else None,
        }
        for k in keys
    ]


@router.delete("/keys/{key_id}")
def revoke_api_key(
    key_id: str,
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("apps:manage")),
):
    key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "API key not found"})
    key.revoked_at = datetime.utcnow()
    db.commit()
    log_audit(db, action="api_key_revoked", actor_id=principal.actor_id, target_id=key.id, detail={"name": key.name})
    return {"status": "ok", "message": f"API key '{key.name}' revoked"}


@router.post("/integrations/apps")
def create_integration_app(
    payload: IntegrationAppCreateRequest,
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("apps:manage")),
):
    client_id = f"app_{generate_random_token(10)}"
    raw_secret = f"sec_{generate_random_token(24)}"
    product = Product(
        name=payload.name.strip(),
        client_id=client_id,
        client_secret_hash=hash_token(raw_secret),
        redirect_uri=payload.redirect_uri.strip(),
        allowed_origins=payload.allowed_origins,
        api_only=payload.api_only,
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    log_audit(
        db,
        action="product_registered",
        actor_id=principal.actor_id,
        target_id=product.id,
        detail={"name": product.name, "client_id": product.client_id},
    )
    return {
        "id": product.id,
        "name": product.name,
        "client_id": product.client_id,
        "client_secret": raw_secret,
        "redirect_uri": product.redirect_uri,
        "api_only": product.api_only,
    }


@router.get("/integrations/apps")
def list_integration_apps(
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("sso:read")),
):
    return [
        {
            "id": p.id,
            "name": p.name,
            "client_id": p.client_id,
            "redirect_uri": p.redirect_uri,
            "allowed_origins": p.allowed_origins,
            "api_only": bool(p.api_only),
        }
        for p in db.query(Product).all()
    ]


@router.post("/integrations/apps/{app_id}/rotate-secret")
def rotate_integration_app_secret(
    app_id: str,
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("apps:manage")),
):
    product = db.query(Product).filter(Product.id == app_id).first()
    if not product:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "Integration app not found"})
    new_secret = f"sec_{generate_random_token(24)}"
    product.client_secret_hash = hash_token(new_secret)
    db.commit()
    log_audit(db, action="app_secret_rotated", actor_id=principal.actor_id, target_id=product.id)
    return {"id": product.id, "client_id": product.client_id, "client_secret": new_secret}


@router.delete("/integrations/apps/{app_id}")
def delete_integration_app(
    app_id: str,
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("apps:manage")),
):
    product = db.query(Product).filter(Product.id == app_id).first()
    if not product:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "Integration app not found"})
    pid, cname = product.id, product.name
    db.delete(product)
    db.commit()
    log_audit(db, action="app_deleted", actor_id=principal.actor_id, target_id=pid, detail={"name": cname})
    return {"status": "ok", "message": f"Application '{cname}' deleted"}


@router.post("/integrations/users/verify-token")
def verify_sso_token_via_api(
    payload: VerifyTokenPayload,
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("sso:read")),
):
    decoded = decode_access_token(payload.token)
    if not decoded:
        return {"valid": False, "reason": "invalid_or_expired"}
    user = db.query(User).filter(User.id == decoded.get("sub")).first()
    if not user or user.status != "active":
        return {"valid": False, "reason": "user_inactive_or_missing"}
    return {
        "valid": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "status": user.status,
            "liveness_passed_at": user.liveness_passed_at.isoformat() if user.liveness_passed_at else None,
        },
    }


@router.get("/integrations/users/{user_id}/status")
def get_integration_user_status(
    user_id: str,
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("sso:read")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "user_not_found"})
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "status": user.status,
        "term_end": user.term_end.isoformat() if user.term_end else None,
        "last_active_at": user.last_active_at.isoformat() if user.last_active_at else None,
    }


@router.post("/integrations/users/{user_id}/revoke")
def revoke_user_via_api(
    user_id: str,
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("sso:write")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "user_not_found"})
    if user.role == "admin":
        raise HTTPException(status_code=400, detail={"error": "cannot_disable_admin"})
    now = datetime.utcnow()
    user.status = "disabled"
    user.disabled_at = now
    user.disabled_reason = "left"
    rev_s = db.query(SsoSession).filter(SsoSession.user_id == user.id, SsoSession.revoked_at.is_(None)).update({"revoked_at": now})
    rev_t = db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).update({"revoked_at": now})
    db.commit()

    log_audit(
        db,
        action="integration_user_revoked",
        actor_id=principal.actor_id,
        target_id=user.id,
        detail={"revoked_sessions": rev_s, "revoked_tokens": rev_t},
    )
    return {"status": "ok", "user_id": user.id, "revoked_sessions": rev_s, "revoked_tokens": rev_t}


@router.get("/integrations/audit")
def list_integration_audit(
    action: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    principal: AdminOrApiPrincipal = Depends(require_admin_or_api_key("sso:read")),
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    entries = query.order_by(AuditLog.at.desc()).offset(offset).limit(limit).all()
    return [
        {
            "id": e.id,
            "at": e.at.isoformat(),
            "actor_id": e.actor_id,
            "action": e.action,
            "target_id": e.target_id,
            "detail": e.detail,
        }
        for e in entries
    ]
