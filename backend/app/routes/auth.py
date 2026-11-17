from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Invite, SsoSession
from app.security import (
    hash_password,
    verify_password,
    hash_token,
    generate_random_token
)
from app.audit import log_audit
from app.config import SSO_SESSION_HOURS, IS_PRODUCTION
from app.deps import get_current_session, get_current_user_from_session

router = APIRouter(prefix="/auth", tags=["auth"])

class SignupRequest(BaseModel):
    invite_token: str
    name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=8)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    """M1/FR1: Signup with invite token, name and password."""
    token_h = hash_token(payload.invite_token)
    invite = db.query(Invite).filter(Invite.token_hash == token_h).first()

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_invite", "message": "Invite token is invalid"}
        )

    if invite.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invite_used", "message": "Invite token has already been used"}
        )

    if invite.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invite_expired", "message": "Invite token has expired"}
        )

    # Check if user already exists
    existing = db.query(User).filter(User.email == invite.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "user_exists", "message": "User with this email already exists"}
        )

    # Create new active user
    new_user = User(
        email=invite.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=invite.role,
        status="active",
        term_end=invite.term_end,
        created_at=datetime.utcnow(),
        last_active_at=datetime.utcnow()
    )
    db.add(new_user)
    
    # Mark invite as used
    invite.used_at = datetime.utcnow()
    db.commit()
    db.refresh(new_user)

    log_audit(
        db,
        action="signup",
        actor_id=new_user.id,
        target_id=new_user.id,
        detail={"email": new_user.email, "role": new_user.role}
    )

    # Next step is liveness check before session creation
    return {
        "status": "ok",
        "next": "liveness",
        "user_id": new_user.id,
        "email": new_user.email
    }

@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    existing_session: Optional[SsoSession] = Depends(get_current_session)
):
    """M2/FR5: Login with email and password."""
    user = db.query(User).filter(User.email == payload.email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        log_audit(
            db,
            action="login_fail",
            actor_id=user.id if user else None,
            detail={"email": payload.email, "reason": "invalid_credentials"}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_credentials", "message": "Invalid email or password"}
        )

    if user.status != "active":
        log_audit(
            db,
            action="access_denied",
            actor_id=user.id,
            target_id=user.id,
            detail={"status": user.status, "reason": user.disabled_reason}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": f"Account is {user.status}"}
        )

    # Check if a live SSO session already exists for this exact user
    if existing_session and existing_session.user_id == user.id:
        user.last_active_at = datetime.utcnow()
        db.commit()
        log_audit(
            db,
            action="login_ok",
            actor_id=user.id,
            target_id=user.id,
            detail={"session_reused": True}
        )
        return {
            "status": "ok",
            "next": "authenticated",
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "role": user.role
            }
        }

    # No existing session: user passed password, now requires liveness check
    return {
        "status": "ok",
        "next": "liveness",
        "user_id": user.id,
        "email": user.email
    }

@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    session_obj: Optional[SsoSession] = Depends(get_current_session)
):
    """FR1: Ends SSO session. Logout never deletes an account."""
    if session_obj:
        session_obj.revoked_at = datetime.utcnow()
        db.commit()

    # Clear cookie
    response.delete_cookie(
        key="sso_session",
        path="/",
        httponly=True,
        samesite="lax"
    )

    return {"status": "ok", "message": "Logged out successfully"}

@router.get("/me")
def get_me(
    request: Request,
    db: Session = Depends(get_db)
):
    """Retrieve current logged in user details and status."""
    # Check session cookie first
    session_id = request.cookies.get("sso_session")
    if session_id:
        session_obj = db.query(SsoSession).filter(
            SsoSession.id == session_id,
            SsoSession.revoked_at.is_(None),
            SsoSession.expires_at > datetime.utcnow()
        ).first()
        if session_obj:
            user = db.query(User).filter(User.id == session_obj.user_id).first()
            if user:
                return {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "role": user.role,
                    "status": user.status,
                    "term_end": str(user.term_end) if user.term_end else None,
                    "last_active_at": user.last_active_at.isoformat() if user.last_active_at else None,
                    "liveness_passed_at": user.liveness_passed_at.isoformat() if user.liveness_passed_at else None
                }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": "unauthorized", "message": "Not authenticated"}
    )
