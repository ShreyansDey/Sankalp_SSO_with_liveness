from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, Form
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product, User, SsoSession, AuthCode, RefreshToken
from app.security import (
    hash_token,
    generate_random_token,
    create_access_token,
    verify_password
)
from app.audit import log_audit
from app.config import FRONTEND_ORIGIN
from app.deps import get_current_session, get_current_user_from_token

router = APIRouter(tags=["sso"])

class TokenRequest(BaseModel):
    grant_type: str = "authorization_code"
    code: str
    client_id: str
    client_secret: str

class RefreshRequest(BaseModel):
    refresh_token: str
    client_id: str
    client_secret: str

def verify_product_secret(product: Product, secret: str) -> bool:
    """Verify client secret against stored hash (supports SHA-256 or Argon2)."""
    if hash_token(secret) == product.client_secret_hash:
        return True
    return verify_password(secret, product.client_secret_hash)

@router.get("/authorize")
def authorize(
    client_id: str,
    redirect_uri: str,
    state: Optional[str] = None,
    request: Request = None,
    db: Session = Depends(get_db),
    session_obj: Optional[SsoSession] = Depends(get_current_session)
):
    """
    FR6/FR8: SSO Authorization endpoint.
    If live SSO session exists -> issue code and redirect back instantly.
    Else -> redirect to central login page.
    """
    # Validate product exists
    product = db.query(Product).filter(Product.client_id == client_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_client", "message": "Unknown client_id"}
        )

    # Security check: redirect_uri must match registered address exactly
    # Normalize trailing slash comparison if needed, or exact match
    if product.redirect_uri.rstrip("/") != redirect_uri.rstrip("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_redirect_uri", "message": "Redirect URI does not match registered URI"}
        )

    # Check if user has an active SSO session
    if session_obj:
        user = db.query(User).filter(User.id == session_obj.user_id).first()
        if user and user.status == "active":
            # Generate one-time 60s auth code
            raw_code = generate_random_token(24)
            code_h = hash_token(raw_code)
            auth_code = AuthCode(
                user_id=user.id,
                product_id=product.id,
                code_hash=code_h,
                expires_at=datetime.utcnow() + timedelta(seconds=60),
                used_at=None
            )
            db.add(auth_code)
            user.last_active_at = datetime.utcnow()
            db.commit()

            # Redirect back to product with code and state
            params = {"code": raw_code}
            if state:
                params["state"] = state
            separator = "&" if "?" in redirect_uri else "?"
            target_url = f"{redirect_uri}{separator}{urlencode(params)}"
            return RedirectResponse(url=target_url, status_code=status.HTTP_302_FOUND)

    # No session or user inactive -> redirect to central login UI
    login_params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri
    }
    if state:
        login_params["state"] = state

    target_login_url = f"{FRONTEND_ORIGIN}/login?{urlencode(login_params)}"
    return RedirectResponse(url=target_login_url, status_code=status.HTTP_302_FOUND)

@router.post("/token")
def issue_token(
    payload: TokenRequest,
    db: Session = Depends(get_db)
):
    """
    FR4: Exchange one-time auth code for 10-minute access token and revocable refresh token.
    """
    product = db.query(Product).filter(Product.client_id == payload.client_id).first()
    if not product or not verify_product_secret(product, payload.client_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_client", "message": "Invalid client_id or client_secret"}
        )

    code_h = hash_token(payload.code)
    auth_code = db.query(AuthCode).filter(
        AuthCode.code_hash == code_h,
        AuthCode.product_id == product.id
    ).first()

    if not auth_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_grant", "message": "Invalid authorization code"}
        )

    if auth_code.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_grant", "message": "Authorization code already used"}
        )

    if auth_code.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_grant", "message": "Authorization code expired"}
        )

    # Mark code used immediately
    auth_code.used_at = datetime.utcnow()

    user = db.query(User).filter(User.id == auth_code.user_id).first()
    if not user or user.status != "active":
        db.commit()
        log_audit(
            db,
            action="access_denied",
            actor_id=user.id if user else None,
            target_id=product.id,
            detail={"reason": "user_inactive_at_token_exchange"}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "User account is not active"}
        )

    # Issue 10-minute JWT access token
    access_token = create_access_token(user.id, user.email, user.role)

    # Issue refresh token (valid 30 days)
    raw_refresh = generate_random_token(32)
    refresh_h = hash_token(raw_refresh)
    refresh_obj = RefreshToken(
        user_id=user.id,
        product_id=product.id,
        token_hash=refresh_h,
        expires_at=datetime.utcnow() + timedelta(days=30),
        revoked_at=None
    )
    db.add(refresh_obj)
    user.last_active_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        action="token_issued",
        actor_id=user.id,
        target_id=product.id,
        detail={"product": product.name, "grant_type": "authorization_code"}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 600,
        "refresh_token": raw_refresh
    }

@router.post("/token/refresh")
def refresh_token(
    payload: RefreshRequest,
    db: Session = Depends(get_db)
):
    """
    FR4: Refresh an expired access token using a valid refresh token.
    Fails immediately if user has been disabled or marked as left.
    """
    product = db.query(Product).filter(Product.client_id == payload.client_id).first()
    if not product or not verify_product_secret(product, payload.client_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_client", "message": "Invalid client_id or client_secret"}
        )

    token_h = hash_token(payload.refresh_token)
    ref_obj = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_h,
        RefreshToken.product_id == product.id
    ).first()

    if not ref_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_grant", "message": "Invalid refresh token"}
        )

    if ref_obj.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "token_revoked", "message": "Refresh token has been revoked"}
        )

    if ref_obj.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "token_expired", "message": "Refresh token has expired"}
        )

    user = db.query(User).filter(User.id == ref_obj.user_id).first()
    if not user or user.status != "active":
        log_audit(
            db,
            action="access_denied",
            actor_id=user.id if user else None,
            target_id=product.id,
            detail={"reason": "account_disabled_during_refresh"}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "Account is not active"}
        )

    # Issue new access token
    new_access_token = create_access_token(user.id, user.email, user.role)
    user.last_active_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        action="token_issued",
        actor_id=user.id,
        target_id=product.id,
        detail={"product": product.name, "grant_type": "refresh_token"}
    )

    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "expires_in": 600
    }

@router.get("/userinfo")
def get_userinfo(
    current_user: User = Depends(get_current_user_from_token)
):
    """FR4: User profile information for authorized products."""
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "status": current_user.status
    }
