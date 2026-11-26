from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from fastapi import Request, HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, SsoSession, ApiKey
from app.security import decode_access_token, hash_token


@dataclass
class AdminOrApiPrincipal:
    """Unified principal representing either a logged-in admin user or a scoped API key."""
    kind: str  # "user" | "api_key"
    actor_id: str
    user: Optional[User] = None
    api_key: Optional[ApiKey] = None
    scopes: list[str] = None


def get_current_session(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[SsoSession]:
    """Retrieve active SSO session from the sso_session cookie or Bearer/X-Session-ID header."""
    session_id = request.cookies.get("sso_session")
    if not session_id:
        auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            candidate = auth_header.split(" ", 1)[1].strip()
            if not candidate.startswith("sk_live_"):
                session_id = candidate
        elif request.headers.get("X-Session-ID"):
            session_id = request.headers.get("X-Session-ID").strip()

    if not session_id:
        return None

    session_obj = (
        db.query(SsoSession)
        .filter(
            SsoSession.id == session_id,
            SsoSession.revoked_at.is_(None),
            SsoSession.expires_at > datetime.utcnow(),
        )
        .first()
    )
    return session_obj


def get_current_user_from_session(
    session_obj: Optional[SsoSession] = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> User:
    """Ensure user has a valid active SSO session and account is active."""
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "unauthorized", "message": "No active session found"},
        )

    user = db.query(User).filter(User.id == session_obj.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "user_not_found", "message": "User not found"},
        )

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": f"Account is {user.status}"},
        )

    user.last_active_at = datetime.utcnow()
    db.commit()
    return user


def get_current_user_from_token(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Ensure request has a valid Bearer access token and user is active."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "missing_token", "message": "Bearer token required"},
        )

    token = auth_header[7:].strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Token is invalid or expired"},
        )

    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "user_not_found", "message": "User not found"},
        )

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": f"Account is {user.status}"},
        )

    user.last_active_at = datetime.utcnow()
    db.commit()
    return user


def require_admin_user(
    current_user: User = Depends(get_current_user_from_session),
) -> User:
    """Ensure user is an active admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "forbidden", "message": "Admin privileges required"},
        )
    return current_user


def get_api_key_record(request: Request, db: Session) -> Optional[ApiKey]:
    """Authenticate an external caller via X-API-Key or Bearer sk_live_ token."""
    raw_key = request.headers.get("X-API-Key")
    if not raw_key:
        auth_header = request.headers.get("Authorization") or ""
        if auth_header.startswith("Bearer sk_live_"):
            raw_key = auth_header[7:].strip()
    if not raw_key:
        return None

    key_hash = hash_token(raw_key.strip())
    record = (
        db.query(ApiKey)
        .filter(ApiKey.key_hash == key_hash, ApiKey.revoked_at.is_(None))
        .first()
    )
    if not record:
        return None
    if record.expires_at and record.expires_at <= datetime.utcnow():
        return None
    record.last_used_at = datetime.utcnow()
    db.commit()
    return record


def require_admin_or_api_key(required_scope: str = "sso:read"):
    """Dependency factory allowing either an admin session or an API key carrying the required scope."""
    def _dependency(
        request: Request,
        db: Session = Depends(get_db),
        session_obj: Optional[SsoSession] = Depends(get_current_session),
    ) -> AdminOrApiPrincipal:
        api_key = get_api_key_record(request, db)
        if api_key:
            scopes = api_key.scopes if isinstance(api_key.scopes, list) else []
            if "*" not in scopes and "admin" not in scopes and required_scope not in scopes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"error": "insufficient_scope", "message": f"API key lacks scope '{required_scope}'"},
                )
            return AdminOrApiPrincipal(
                kind="api_key",
                actor_id=api_key.id,
                api_key=api_key,
                scopes=scopes,
            )

        if session_obj:
            user = db.query(User).filter(User.id == session_obj.user_id).first()
            if user and user.status == "active" and user.role == "admin":
                user.last_active_at = datetime.utcnow()
                db.commit()
                return AdminOrApiPrincipal(
                    kind="user",
                    actor_id=user.id,
                    user=user,
                    scopes=["*"],
                )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "unauthorized", "message": "Valid admin session or API key required"},
        )

    return _dependency
