from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import quote, urlparse
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import ACCESS_TOKEN_MINUTES, FRONTEND_ORIGIN
from app.database import get_db
from app.deps import get_api_key_record, get_current_session, get_current_user_from_session, get_current_user_from_token
from app.models import AuthCode, Product, RefreshToken, SsoSession, User
from app.schemas.sso import IntrospectRequest, RefreshRequest, RevokeRequest, TokenRequest
from app.security import (
    constant_time_compare,
    create_access_token,
    decode_access_token,
    generate_random_token,
    hash_token,
    verify_pkce,
)

router = APIRouter(tags=["SSO Flow & OIDC"])


def _verify_product_credentials(db: Session, client_id: str, client_secret: str) -> Optional[Product]:
    product = db.query(Product).filter(Product.client_id == client_id).first()
    if not product:
        return None
    if not constant_time_compare(hash_token(client_secret), product.client_secret_hash):
        return None
    return product


def _is_allowed_redirect_uri(product: Product, redirect_uri: str) -> bool:
    """Strict exact-URI validation against registered redirect_uri values (blocks open redirects)."""
    if not redirect_uri or not isinstance(redirect_uri, str):
        return False
    parsed = urlparse(redirect_uri)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    candidate = redirect_uri.strip().rstrip("/")

    allowed_list = []
    if product.redirect_uri:
        for item in product.redirect_uri.replace("\n", ",").split(","):
            clean = item.strip().rstrip("/")
            if clean:
                allowed_list.append(clean)
    return candidate in allowed_list


@router.get("/.well-known/openid-configuration")
def openid_discovery(request: Request):
    """Standard OIDC / OAuth2 Discovery Document for plug-and-play external app integration."""
    base_url = str(request.base_url).rstrip("/")
    return {
        "issuer": base_url,
        "authorization_endpoint": f"{base_url}/authorize",
        "token_endpoint": f"{base_url}/token",
        "token_refresh_endpoint": f"{base_url}/token/refresh",
        "introspection_endpoint": f"{base_url}/token/introspect",
        "revocation_endpoint": f"{base_url}/token/revoke",
        "userinfo_endpoint": f"{base_url}/userinfo",
        "jwks_algorithms_supported": ["HS256"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "subject_types_supported": ["public"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "token_endpoint_auth_methods_supported": ["client_secret_post"],
        "scopes_supported": ["openid", "profile", "email", "role"],
        "service_documentation": f"{base_url}/docs",
    }


@router.get("/authorize")
def authorize(
    request: Request,
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    response_type: str = Query("code"),
    state: Optional[str] = Query(None),
    code_challenge: Optional[str] = Query(None),
    code_challenge_method: Optional[str] = Query("S256"),
    db: Session = Depends(get_db),
    session_obj: Optional[SsoSession] = Depends(get_current_session),
):
    """OAuth2 Authorization Code endpoint enforcing exact redirect URI match and optional PKCE."""
    if response_type != "code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "unsupported_response_type", "message": "Only response_type=code is supported"},
        )

    product = db.query(Product).filter(Product.client_id == client_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_client", "message": "Unknown client_id"},
        )

    if not _is_allowed_redirect_uri(product, redirect_uri):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_redirect_uri", "message": "redirect_uri does not match registered client URI"},
        )

    if code_challenge and (code_challenge_method or "S256").upper() not in {"S256", "PLAIN"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_request", "message": "Unsupported code_challenge_method"},
        )

    if not session_obj:
        target = quote(str(request.url), safe="")
        return RedirectResponse(url=f"{FRONTEND_ORIGIN}/login?next={target}", status_code=302)

    user = db.query(User).filter(User.id == session_obj.user_id).first()
    if not user or user.status != "active":
        log_audit(
            db,
            action="access_denied",
            actor_id=session_obj.user_id,
            target_id=product.id,
            detail={"reason": f"account_{user.status}" if user else "missing_user", "client_id": client_id},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "Account has been disabled; access denied"},
        )

    raw_code = generate_random_token(24)
    now = datetime.utcnow()
    auth_code = AuthCode(
        user_id=user.id,
        product_id=product.id,
        code_hash=hash_token(raw_code),
        code_challenge=code_challenge,
        code_challenge_method=(code_challenge_method or "S256").upper() if code_challenge else None,
        redirect_uri=redirect_uri.strip().rstrip("/"),
        expires_at=now + timedelta(seconds=60),
    )
    db.add(auth_code)
    user.last_active_at = now
    db.commit()

    log_audit(
        db,
        action="token_issued",
        actor_id=user.id,
        target_id=product.id,
        detail={"client_id": product.client_id, "grant": "authorization_code", "pkce": bool(code_challenge)},
    )

    separator = "&" if "?" in redirect_uri else "?"
    redirect_target = f"{redirect_uri}{separator}code={quote(raw_code, safe='')}"
    if state:
        redirect_target += f"&state={quote(state, safe='')}"
    return RedirectResponse(url=redirect_target, status_code=302)


@router.post("/token")
def issue_token(payload: TokenRequest, db: Session = Depends(get_db)):
    """Exchange single-use authorization code (+ optional PKCE verifier) for short-lived JWT + refresh token."""
    if payload.grant_type != "authorization_code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "unsupported_grant_type", "message": "grant_type must be 'authorization_code'"},
        )

    product = _verify_product_credentials(db, payload.client_id, payload.client_secret)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_client", "message": "Invalid client_id or client_secret"},
        )

    code_hashed = hash_token(payload.code)
    auth_code = (
        db.query(AuthCode)
        .filter(AuthCode.code_hash == code_hashed, AuthCode.product_id == product.id)
        .first()
    )
    if not auth_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_grant", "message": "Authorization code is invalid"},
        )

    now = datetime.utcnow()
    if auth_code.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "code_expired", "message": "Authorization code has expired"},
        )

    # Atomic single-use claim to eliminate concurrent code replay race
    res = db.execute(
        update(AuthCode)
        .where(AuthCode.id == auth_code.id, AuthCode.used_at.is_(None))
        .values(used_at=now)
    )
    if res.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_grant", "message": "Authorization code has already been exchanged"},
        )

    if auth_code.redirect_uri and payload.redirect_uri:
        if payload.redirect_uri.strip().rstrip("/") != auth_code.redirect_uri:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "redirect_uri_mismatch", "message": "redirect_uri does not match authorization request"},
            )

    if auth_code.code_challenge:
        if not verify_pkce(auth_code.code_challenge, auth_code.code_challenge_method, payload.code_verifier):
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_pkce", "message": "PKCE code_verifier verification failed"},
            )

    user = db.query(User).filter(User.id == auth_code.user_id).first()
    if not user or user.status != "active":
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "User account is disabled"},
        )

    access_token = create_access_token(user_id=user.id, email=user.email, role=user.role)
    raw_refresh = generate_random_token(32)
    refresh_obj = RefreshToken(
        user_id=user.id,
        product_id=product.id,
        token_hash=hash_token(raw_refresh),
        expires_at=now + timedelta(days=7),
    )
    db.add(refresh_obj)
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_MINUTES * 60,
        "refresh_token": raw_refresh,
        "scope": "openid profile email role",
    }


@router.post("/token/refresh")
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    """Re-verify client credentials, unrevoked refresh token, and active user status, returning a fresh 10m JWT."""
    product = _verify_product_credentials(db, payload.client_id, payload.client_secret)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_client", "message": "Invalid client credentials"},
        )

    now = datetime.utcnow()
    token_obj = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token_hash == hash_token(payload.refresh_token),
            RefreshToken.product_id == product.id,
        )
        .first()
    )
    if not token_obj or token_obj.revoked_at is not None or token_obj.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Refresh token invalid, revoked, or expired"},
        )

    user = db.query(User).filter(User.id == token_obj.user_id).first()
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "User account is disabled; cannot refresh"},
        )

    user.last_active_at = now
    new_access_token = create_access_token(user_id=user.id, email=user.email, role=user.role)
    db.commit()

    return {
        "access_token": new_access_token,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_MINUTES * 60,
    }


@router.post("/token/introspect")
def introspect_token(
    payload: IntrospectRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """RFC 7662 token introspection verifying JWT signature AND live user active status."""
    api_key = get_api_key_record(request, db)
    if not api_key:
        if not (payload.client_id and payload.client_secret and _verify_product_credentials(db, payload.client_id, payload.client_secret)):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "unauthorized", "message": "Valid client credentials or X-API-Key required"},
            )

    decoded = decode_access_token(payload.token)
    if not decoded:
        return {"active": False}

    user = db.query(User).filter(User.id == decoded.get("sub")).first()
    if not user or user.status != "active":
        return {"active": False}

    log_audit(db, action="token_introspected", actor_id=api_key.id if api_key else payload.client_id, target_id=user.id)
    return {
        "active": True,
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "status": user.status,
        "exp": decoded.get("exp"),
        "iat": decoded.get("iat"),
        "jti": decoded.get("jti"),
    }


@router.post("/token/revoke")
def revoke_token(payload: RevokeRequest, request: Request, db: Session = Depends(get_db)):
    """RFC 7009 token revocation for refresh tokens or session IDs."""
    api_key = get_api_key_record(request, db)
    if not api_key:
        if not (payload.client_id and payload.client_secret and _verify_product_credentials(db, payload.client_id, payload.client_secret)):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "unauthorized", "message": "Valid client credentials or X-API-Key required"},
            )

    now = datetime.utcnow()
    hashed = hash_token(payload.token)
    revoked_count = db.query(RefreshToken).filter(RefreshToken.token_hash == hashed, RefreshToken.revoked_at.is_(None)).update(
        {"revoked_at": now}
    )
    if revoked_count == 0:
        revoked_count = db.query(SsoSession).filter(SsoSession.id == payload.token, SsoSession.revoked_at.is_(None)).update(
            {"revoked_at": now}
        )
    db.commit()
    log_audit(db, action="token_revoked", actor_id=api_key.id if api_key else payload.client_id, detail={"revoked": revoked_count})
    return {"revoked": bool(revoked_count), "count": revoked_count}


@router.get("/me")
def get_me_root_alias(current_user: User = Depends(get_current_user_from_session)):
    """Root alias for active session user profile (compatible with frontend portal checks)."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "status": current_user.status,
        "term_end": current_user.term_end.isoformat() if current_user.term_end else None,
        "require_face_match": current_user.require_face_match,
    }


@router.get("/userinfo")
def get_userinfo(current_user: User = Depends(get_current_user_from_token)):
    """OIDC UserInfo endpoint returning current identity attributes of active user."""
    return {
        "sub": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "status": current_user.status,
        "liveness_verified_at": (
            current_user.liveness_passed_at.isoformat() if current_user.liveness_passed_at else None
        ),
    }
