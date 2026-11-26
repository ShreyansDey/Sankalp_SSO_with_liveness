from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import UPLOAD_DIR
from app.database import get_db
from app.deps import get_current_session, get_current_user_from_session
from app.models import SsoSession, User
from app.routes.auth_onboarding import apply_membership, register, signup  # noqa: F401
from app.routes.auth_onboarding import router as onboarding_router
from app.routes.auth_recovery import (  # noqa: F401
    forgot_password,
    reset_password,
    submit_renewal_request,
    verify_reset_token,
)
from app.routes.auth_recovery import router as recovery_router
from app.schemas.auth import (  # noqa: F401
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    VerifyResetTokenRequest,
)
from app.security import create_signed_ticket, verify_password
from app.services.face_engine import extract_face_embedding  # noqa: F401

router = APIRouter(prefix="/auth", tags=["Authentication"])
FACES_DIR = UPLOAD_DIR / "faces"
DOCS_DIR = UPLOAD_DIR / "documents"
router.include_router(onboarding_router)
router.include_router(recovery_router)


def admin_login():
    """Deprecated passwordless admin login explicitly disabled for security."""
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"error": "admin_login_removed", "message": "Passwordless admin login has been removed."},
    )


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request = None,
    response: Response = None,
    db: Session = Depends(get_db),
):
    """Step 1 of SSO login: verify email & password, then issue a short-lived signed liveness ticket."""
    email = (payload.email or "").strip().lower()
    if not email or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_input", "message": "Email and password are required"},
        )

    user = db.query(User).filter(User.email == email).first()
    if not user:
        log_audit(db, action="login_fail", detail={"reason": "unknown_account"})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_credentials", "message": "Invalid email or password"},
        )

    if user.status == "pending_approval":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "account_pending_approval",
                "message": "Your application is awaiting administrator verification. You will be notified by email once approved.",
            },
        )

    if user.status != "active":
        log_audit(
            db,
            action="login_fail",
            actor_id=user.id,
            target_id=user.id,
            detail={"reason": f"account_{user.status}"},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "account_disabled", "message": "Your account is currently disabled."},
        )

    if not verify_password(payload.password, user.password_hash):
        log_audit(
            db,
            action="login_fail",
            actor_id=user.id,
            target_id=user.id,
            detail={"reason": "wrong_password"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_credentials", "message": "Invalid email or password"},
        )

    if payload.name and payload.name.strip():
        user.name = payload.name.strip()[:255]
    if payload.phone and payload.phone.strip():
        user.phone = payload.phone.strip()[:50]

    user.last_active_at = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        action="login_ok",
        actor_id=user.id,
        target_id=user.id,
        detail={"ip": request.client.host if (request and request.client) else None},
    )

    login_ticket = create_signed_ticket(user.id, purpose="liveness")
    return {
        "status": "ok",
        "next": "liveness",
        "user_id": user.id,
        "email": user.email,
        "login_ticket": login_ticket,
        "message": "Password verified. Proceed to live human verification.",
    }


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    session_obj: SsoSession = Depends(get_current_session),
):
    """Revoke current SSO session and clear browser cookie."""
    if session_obj:
        session_obj.revoked_at = datetime.utcnow()
        db.commit()

    response.delete_cookie(key="sso_session", path="/")
    return {"message": "Signed out cleanly"}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user_from_session)):
    """Return profile of the currently authenticated active user."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "status": current_user.status,
        "term_end": current_user.term_end.isoformat() if current_user.term_end else None,
        "last_active_at": current_user.last_active_at.isoformat() if current_user.last_active_at else None,
        "liveness_passed_at": current_user.liveness_passed_at.isoformat() if current_user.liveness_passed_at else None,
        "require_face_match": current_user.require_face_match,
    }
