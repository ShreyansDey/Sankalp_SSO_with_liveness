import os
import re
import uuid
import base64
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import User, Invite, SsoSession, PasswordResetToken, RenewalRequest, RefreshToken, AuthCode
from app.security import (
    hash_password,
    verify_password,
    hash_token,
    generate_random_token
)
from app.audit import log_audit
from app.config import SSO_SESSION_HOURS, IS_PRODUCTION, FRONTEND_ORIGIN, PURGE_GRACE_HOURS
from app.deps import get_current_session, get_current_user_from_session
from app.services.face_engine import extract_face_embedding
from app.services.email_service import (
    send_password_reset_email,
    send_application_submitted_emails,
    send_password_changed_email
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Upload storage directories
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
FACES_DIR = UPLOAD_DIR / "faces"
DOCS_DIR = UPLOAD_DIR / "documents"
FACES_DIR.mkdir(parents=True, exist_ok=True)
DOCS_DIR.mkdir(parents=True, exist_ok=True)

from app.schemas.auth import (
    SignupRequest,
    ApplyRequest,
    RegisterRequest,
    LoginRequest,
    ForgotPasswordRequest,
    VerifyResetTokenRequest,
    ResetPasswordRequest,
    SubmitRenewalRequest
)

@router.get("/invite-info")
def get_invite_info(token: str, db: Session = Depends(get_db)):
    """Fetches public invite metadata (email, role) for prefilling enrollment."""
    token_h = hash_token(token)
    invite = db.query(Invite).filter(Invite.token_hash == token_h).first()
    if not invite or invite.used_at is not None or invite.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_invite", "message": "Invitation link is invalid or expired."}
        )
    return {
        "email": invite.email,
        "role": invite.role,
        "valid": True
    }

@router.post("/apply")
def apply_membership(payload: ApplyRequest, db: Session = Depends(get_db)):
    """
    e-KYC Onboarding: Invite acceptance with live face snapshot and supporting document.
    Extracts 128D biometric embedding vector and creates user in 'pending_approval' status.
    Requires manual administrator review and confirmation before login is allowed.
    """
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
            detail={"error": "invite_used", "message": "This invite token has already been used"}
        )

    if invite.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invite_expired", "message": "Invite token has expired"}
        )

    existing = db.query(User).filter(User.email == invite.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "user_exists", "message": "An account with this email already exists"}
        )

    # 1. Verify and extract face embedding vector
    embedding = extract_face_embedding(payload.face_photo)
    if embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "face_not_detected",
                "message": "Could not detect a clear, centered face in the captured portrait. Please ensure adequate lighting and face the camera directly."
            }
        )

    user_id = str(uuid.uuid4())

    # 2. Save face photo snapshot for admin visual verification
    face_filename = f"{user_id}.jpg"
    face_path = FACES_DIR / face_filename
    try:
        if "," in payload.face_photo:
            _, raw_b64 = payload.face_photo.split(",", 1)
        else:
            raw_b64 = payload.face_photo
        with open(face_path, "wb") as f:
            f.write(base64.b64decode(raw_b64))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_photo", "message": "Failed to decode captured portrait image"}
        )

    # 3. Save supporting document if provided
    doc_path_str = None
    if payload.document_base64:
        try:
            safe_name = re.sub(r'[^a-zA-Z0-9_\.-]', '_', payload.document_name or "student_id.jpg")
            doc_filename = f"{user_id}_{safe_name}"
            doc_file = DOCS_DIR / doc_filename
            if "," in payload.document_base64:
                _, doc_b64 = payload.document_base64.split(",", 1)
            else:
                doc_b64 = payload.document_base64
            with open(doc_file, "wb") as f:
                f.write(base64.b64decode(doc_b64))
            doc_path_str = str(doc_file)
        except Exception:
            pass  # Non-fatal if document fails to write

    # 4. Create user in pending_approval status
    new_user = User(
        id=user_id,
        email=invite.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=invite.role,
        status="pending_approval",
        term_end=invite.term_end,
        created_at=datetime.utcnow(),
        last_active_at=datetime.utcnow(),
        face_embedding=embedding,
        face_photo_path=str(face_path),
        document_path=doc_path_str
    )
    db.add(new_user)
    invite.used_at = datetime.utcnow()
    db.commit()
    db.refresh(new_user)

    log_audit(
        db,
        action="application_submitted",
        actor_id=new_user.id,
        target_id=new_user.id,
        detail={
            "email": new_user.email,
            "has_document": bool(doc_path_str),
            "status": "pending_approval"
        }
    )

    return {
        "status": "ok",
        "next": "pending_approval",
        "message": "Your membership application and supporting documents have been submitted for administrator review.",
        "user_id": new_user.id,
        "email": new_user.email
    }

@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """
    Self-service account registration.
    User inputs email, name, phone number, password, recent clicked image, and supporting document.
    All fields are compulsory. Creates account in 'pending_approval' status, awaiting admin review.
    Once confirmed by the admin, user can log in with their credentials.
    """
    email_clean = payload.email.strip().lower()
    if not re.match(r"^[^@]+@[^@]+\.[^@]+$", email_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_email", "message": "Please provide a valid email address."}
        )

    if not payload.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "missing_name", "message": "Full Name is required."}
        )

    if not payload.phone.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "missing_phone", "message": "Phone number is required."}
        )

    # Check if user already exists
    existing = db.query(User).filter(func.lower(User.email) == email_clean).first()
    if existing:
        if existing.status == "pending_approval":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "already_pending",
                    "message": "An application with this email has already been submitted and is awaiting administrator approval."
                }
            )
        elif existing.status == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "user_exists", "message": "An account with this email already exists. Please log in."}
            )
        elif existing.status == "disabled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "account_disabled", "message": "This account has been disabled. Please contact your organization administrator."}
            )

    user_id = str(uuid.uuid4())
    user_role = "member"
    term_end = None
    invite_obj = None

    if payload.invite_token:
        token_h = hash_token(payload.invite_token)
        invite_obj = db.query(Invite).filter(Invite.token_hash == token_h).first()
        if not invite_obj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_invite", "message": "Invitation token is invalid."}
            )
        if invite_obj.used_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invite_used", "message": "This invitation link has already been used."}
            )
        if invite_obj.expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invite_expired", "message": "This invitation link has expired."}
            )
        user_role = invite_obj.role
        term_end = invite_obj.term_end

    # 1. Biometric embedding extraction (graceful if ONNX models not downloaded)
    embedding = None
    try:
        embedding = extract_face_embedding(payload.face_photo)
    except Exception:
        embedding = None

    # 2. Save face photo snapshot to uploads directory
    face_filename = f"{user_id}.jpg"
    face_path = FACES_DIR / face_filename
    try:
        if "," in payload.face_photo:
            _, raw_b64 = payload.face_photo.split(",", 1)
        else:
            raw_b64 = payload.face_photo
        with open(face_path, "wb") as f:
            f.write(base64.b64decode(raw_b64))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_photo", "message": "Failed to decode the captured portrait image. Please retake it."}
        )

    # 3. Save supporting document
    doc_path_str = None
    try:
        safe_name = re.sub(r'[^a-zA-Z0-9_\.-]', '_', payload.document_name or "supporting_doc.pdf")
        doc_filename = f"{user_id}_{safe_name}"
        doc_file = DOCS_DIR / doc_filename
        if "," in payload.document_base64:
            _, doc_b64 = payload.document_base64.split(",", 1)
        else:
            doc_b64 = payload.document_base64
        with open(doc_file, "wb") as f:
            f.write(base64.b64decode(doc_b64))
        doc_path_str = str(doc_file)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_document", "message": "Failed to decode supporting document. Please re-upload your document."}
        )

    # 4. Create user in pending_approval status
    new_user = User(
        id=user_id,
        email=email_clean,
        name=payload.name.strip(),
        phone=payload.phone.strip(),
        password_hash=hash_password(payload.password),
        role=user_role,
        term_end=term_end,
        status="pending_approval",
        created_at=datetime.utcnow(),
        last_active_at=datetime.utcnow(),
        face_embedding=embedding,
        face_photo_path=str(face_path),
        document_path=doc_path_str
    )
    db.add(new_user)
    if invite_obj:
        invite_obj.used_at = datetime.utcnow()
    db.commit()
    db.refresh(new_user)

    log_audit(
        db,
        action="application_submitted",
        actor_id=new_user.id,
        target_id=new_user.id,
        detail={
            "email": new_user.email,
            "name": new_user.name,
            "phone": new_user.phone,
            "has_document": True,
            "status": "pending_approval",
            "dpdp_consent": payload.consent_given
        }
    )

    # Dispatch confirmation to applicant and alert to admin
    send_application_submitted_emails(
        applicant_name=new_user.name,
        applicant_email=new_user.email,
        background=True
    )

    return {
        "status": "ok",
        "next": "pending_approval",
        "message": "Your registration has been forwarded to the administrator portal. Once confirmed by the administrator, you can log in.",
        "user_id": new_user.id,
        "email": new_user.email
    }

@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    """M1/FR1: Signup with invite token or direct registration, requiring DPDP biometric consent."""
    if not payload.invite_token and not payload.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "missing_credentials", "message": "Either invite token or email address is required"}
        )

    invite = None
    if payload.invite_token:
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

        email_to_use = invite.email
        role_to_use = invite.role
        term_end_to_use = invite.term_end
    else:
        email_clean = payload.email.strip().lower()
        if not re.match(r"^[^@]+@[^@]+\.[^@]+$", email_clean):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_email", "message": "Please provide a valid email address"}
            )
        email_to_use = email_clean
        role_to_use = "member"
        term_end_to_use = None

    # Check if user already exists
    existing = db.query(User).filter(func.lower(User.email) == email_to_use.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "user_exists", "message": "User with this email already exists"}
        )

    # Create new active user
    user_id = str(uuid.uuid4())
    new_user = User(
        id=user_id,
        email=email_to_use,
        name=payload.name.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        password_hash=hash_password(payload.password),
        role=role_to_use,
        status="active",
        term_end=term_end_to_use,
        created_at=datetime.utcnow(),
        last_active_at=datetime.utcnow()
    )
    db.add(new_user)
    
    # Mark invite as used if applicable
    if invite:
        invite.used_at = datetime.utcnow()
    db.commit()
    db.refresh(new_user)

    log_audit(
        db,
        action="signup",
        actor_id=new_user.id,
        target_id=new_user.id,
        detail={
            "email": new_user.email,
            "role": new_user.role,
            "dpdp_consent": payload.consent_given,
            "mode": "invite" if invite else "self_service"
        }
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
    email_clean = payload.email.strip().lower()
    if email_clean in ["admin", "admin@jadavpur.edu"]:
        user = db.query(User).filter(func.lower(User.email) == "admin@jadavpur.edu").first()
    elif email_clean in ["rahul", "rahul@club.edu"]:
        user = db.query(User).filter(func.lower(User.email) == "rahul@club.edu").first()
    else:
        user = db.query(User).filter(func.lower(User.email) == email_clean).first()

    is_valid_pw = False
    if user and verify_password(payload.password, user.password_hash):
        is_valid_pw = True

    if not user or not is_valid_pw:
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

    if payload.name and payload.name.strip():
        user.name = payload.name.strip()
    if payload.phone and payload.phone.strip():
        user.phone = payload.phone.strip()
    db.commit()

    if user.status == "pending_approval":
        log_audit(
            db,
            action="access_denied",
            actor_id=user.id,
            target_id=user.id,
            detail={"status": user.status, "reason": "pending_admin_approval"}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "account_pending_approval",
                "message": "Your membership registration is currently under review by an administrator. Please wait for ID verification."
            }
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
            detail={"error": "account_disabled", "message": f"Account is {user.status} ({user.disabled_reason or 'access suspended'})"}
        )

    # All users (including administrators) require password verification + mandatory liveness camera check
    return {
        "status": "ok",
        "next": "liveness",
        "user_id": user.id,
        "email": user.email
    }

@router.post("/admin-login")
def admin_login():
    """
    Deprecated: Dedicated admin bypass has been removed.
    Administrators authenticate through /auth/login with password and mandatory liveness verification.
    """
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "error": "admin_login_removed",
            "message": "Direct administrator login without liveness has been removed. Please log in using your credentials on the central sign-in page and complete camera liveness verification."
        }
    )

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

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Password Reset: Accepts email, generates a cryptographically secure 15-minute token,
    hashes it into the database, and sends a password reset link to the user's email via SMTP.
    Always returns generic success to prevent email enumeration attacks.
    """
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_clean).first()

    if user and user.status == "active":
        # 1. Generate cryptographically secure URL-safe token
        raw_token = generate_random_token(32)
        token_h = hash_token(raw_token)
        expires_at = datetime.utcnow() + timedelta(minutes=15)

        # 2. Invalidate any existing unused reset tokens for this user
        existing_tokens = db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None)
        ).all()
        for tok in existing_tokens:
            tok.used_at = datetime.utcnow()

        # 3. Save new token
        reset_token_obj = PasswordResetToken(
            id=str(uuid.uuid4()),
            user_id=user.id,
            token_hash=token_h,
            expires_at=expires_at,
            created_at=datetime.utcnow()
        )
        db.add(reset_token_obj)
        db.commit()

        # 4. Construct reset URL
        reset_link = f"{FRONTEND_ORIGIN}/reset-password?token={raw_token}"

        # 5. Dispatch email via SMTP
        send_password_reset_email(
            to_email=user.email,
            name=user.name,
            reset_token=raw_token,
            reset_link=reset_link,
            background=True
        )

        log_audit(
            db,
            action="password_reset_requested",
            actor_id=user.id,
            target_id=user.id,
            detail={"email": user.email}
        )

    return {
        "status": "ok",
        "message": "If an account is associated with this email, a password reset link has been dispatched to your inbox."
    }

@router.post("/verify-reset-token")
def verify_reset_token(payload: VerifyResetTokenRequest, db: Session = Depends(get_db)):
    """
    Validates a password reset token before displaying the reset password form.
    Returns masked email and user name on success.
    """
    cleaned_token = payload.token.strip()
    if not cleaned_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "missing_token", "message": "Verification token is required."}
        )

    token_h = hash_token(cleaned_token)
    reset_tok = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_h).first()

    if not reset_tok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_token", "message": "The password reset link is invalid or has already been used."}
        )

    if reset_tok.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "token_already_used", "message": "This password reset link has already been used."}
        )

    if reset_tok.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "token_expired", "message": "This password reset link has expired (15-minute validity window)."}
        )

    user = db.query(User).filter(User.id == reset_tok.user_id).first()
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_user", "message": "The user account is inactive or suspended."}
        )

    # Return masked email for user confirmation
    email_parts = user.email.split("@")
    if len(email_parts) == 2:
        uname, domain = email_parts
        masked_user = uname[0] + "***" if len(uname) > 1 else uname + "***"
        masked_email = f"{masked_user}@{domain}"
    else:
        masked_email = user.email

    return {
        "status": "ok",
        "valid": True,
        "masked_email": masked_email,
        "name": user.name
    }

@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, request: Request = None, db: Session = Depends(get_db)):
    """
    Submits a new password with the verified reset token.
    Updates the password hash, permanently disables the old password, marks token as used,
    invalidates all active sessions and refresh tokens across all portals, and emails the user.
    """
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "weak_password", "message": "Password must be at least 8 characters long."}
        )

    cleaned_token = payload.token.strip()
    token_h = hash_token(cleaned_token)
    reset_tok = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_h).first()

    if not reset_tok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_token", "message": "The password reset token is invalid."}
        )

    if reset_tok.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "token_already_used", "message": "This password reset token has already been used."}
        )

    if reset_tok.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "token_expired", "message": "This password reset token has expired. Please request a new one."}
        )

    user = db.query(User).filter(User.id == reset_tok.user_id).first()
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_user", "message": "User account is inactive or not found."}
        )

    # Prevent reusing the current password
    if verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "password_reused",
                "message": "New password cannot be the same as your old password. Please choose a different password."
            }
        )

    # 1. Update user password (permanently overwrites and disables old password hash)
    user.password_hash = hash_password(payload.password)

    # 2. Invalidate reset token permanently
    reset_tok.used_at = datetime.utcnow()

    # 3. Invalidate ALL active SSO sessions for this user for immediate revocation across all devices
    active_sessions = db.query(SsoSession).filter(
        SsoSession.user_id == user.id,
        SsoSession.revoked_at.is_(None)
    ).all()
    for s in active_sessions:
        s.revoked_at = datetime.utcnow()

    # 4. Invalidate all active OAuth refresh tokens
    active_refresh = db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked_at.is_(None)
    ).all()
    for rt in active_refresh:
        rt.revoked_at = datetime.utcnow()

    # 5. Revoke any pending authorization codes
    db.query(AuthCode).filter(
        AuthCode.user_id == user.id,
        AuthCode.used_at.is_(None)
    ).delete(synchronize_session=False)

    db.commit()

    # 6. Deliver security notification email directly to requested user
    client_ip = "Unknown IP"
    user_agent = "Unknown Device / Browser"
    if request:
        client_ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "Unknown IP")
        user_agent = request.headers.get("user-agent", "Unknown Device / Browser")
    try:
        send_password_changed_email(user.email, user.name, client_ip, user_agent, background=True)
    except Exception:
        pass

    log_audit(
        db,
        action="password_reset_completed",
        actor_id=user.id,
        target_id=user.id,
        detail={"email": user.email, "sessions_revoked": len(active_sessions), "refresh_tokens_revoked": len(active_refresh)}
    )

    return {
        "status": "ok",
        "message": "Password has been successfully updated and your old password is permanently disabled. All existing sessions have been terminated. You may now sign in with your new password."
    }

@router.post("/renew")
def submit_renewal_request(payload: SubmitRenewalRequest, db: Session = Depends(get_db)):
    """
    Apply for membership/access renewal within the 48-hour accidental revocation/expiration window.
    """
    clean_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "No account found registered with this email address."}
        )

    if user.status == "active":
        return {
            "status": "ok",
            "message": "Your account is already active and does not require renewal.",
            "is_active": True
        }

    if user.status != "disabled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_status", "message": f"Account status is '{user.status}' and cannot submit a renewal request."}
        )

    # Verify 48-hour window
    if user.disabled_at:
        elapsed_hours = (datetime.utcnow() - user.disabled_at).total_seconds() / 3600.0
        if elapsed_hours > PURGE_GRACE_HOURS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "window_expired",
                    "message": f"The {PURGE_GRACE_HOURS}-hour recovery window has expired. Your account records are scheduled for permanent purge. Please register again."
                }
            )

    # Check for existing pending request
    existing_req = db.query(RenewalRequest).filter(
        RenewalRequest.user_id == user.id,
        RenewalRequest.status == "pending"
    ).first()

    if existing_req:
        existing_req.reason = payload.reason.strip()
        existing_req.created_at = datetime.utcnow()
        db.commit()
        return {
            "status": "ok",
            "message": "Your renewal application has been updated and is awaiting administrator review.",
            "request_id": existing_req.id
        }

    req = RenewalRequest(
        user_id=user.id,
        email=user.email,
        name=user.name,
        reason=payload.reason.strip(),
        status="pending"
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    log_audit(
        db,
        action="renewal_requested",
        actor_id=user.id,
        target_id=req.id,
        detail={"email": user.email, "reason": payload.reason.strip()}
    )

    return {
        "status": "ok",
        "message": f"Renewal application submitted successfully! An administrator will review your request within the {PURGE_GRACE_HOURS}-hour window.",
        "request_id": req.id
    }
