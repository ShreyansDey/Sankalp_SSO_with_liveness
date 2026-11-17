from datetime import datetime
from typing import Optional
from fastapi import Request, HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, SsoSession
from app.security import decode_access_token

def get_current_session(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[SsoSession]:
    """Retrieve active SSO session from the sso_session cookie."""
    session_id = request.cookies.get("sso_session")
    if not session_id:
        return None

    session_obj = db.query(SsoSession).filter(
        SsoSession.id == session_id,
        SsoSession.revoked_at.is_(None),
        SsoSession.expires_at > datetime.utcnow()
    ).first()

    return session_obj

def get_current_user_from_session(
    session_obj: Optional[SsoSession] = Depends(get_current_session),
    db: Session = Depends(get_db)
) -> User:
    """Ensure user has a valid active SSO session and account is active."""
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "unauthorized", "message": "No active session found"}
        )

    user = db.query(User).filter(User.id == session_obj.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "user_not_found", "message": "User not found"}
        )

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": f"Account is {user.status}"}
        )

    # Update last_active_at
    user.last_active_at = datetime.utcnow()
    db.commit()

    return user

def get_current_user_from_token(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    """Ensure request has a valid Bearer access token and user is active."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "missing_token", "message": "Bearer token required"}
        )

    token = auth_header[7:].strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Token is invalid or expired"}
        )

    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "user_not_found", "message": "User not found"}
        )

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": f"Account is {user.status}"}
        )

    user.last_active_at = datetime.utcnow()
    db.commit()
    return user

def require_admin_user(
    current_user: User = Depends(get_current_user_from_session)
) -> User:
    """Ensure user is an admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "forbidden", "message": "Admin privileges required"}
        )
    return current_user
