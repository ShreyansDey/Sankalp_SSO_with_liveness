import re
import sys
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import ALLOW_OPEN_SIGNUP, ADMIN_CONTACT_EMAIL, ORG_NAME, resolve_frontend_origin
from app.database import get_db
from app.models import Invite, User
from app.schemas.auth import ApplyRequest, RegisterRequest, SignupRequest
from app.security import create_signed_ticket, hash_password, hash_token
from app.services.email_service import send_application_submitted_emails
from app.services.face_engine import extract_face_embedding, is_face_engine_ready
from app.services.storage_service import (
    MAX_DOCUMENT_BYTES,
    MAX_PORTRAIT_BYTES,
    decode_and_validate_base64,
    save_user_file,
)

router = APIRouter(tags=["Onboarding & Registration"])
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _get_extract_fn():
    auth_mod = sys.modules.get("app.routes.auth")
    return getattr(auth_mod, "extract_face_embedding", extract_face_embedding) if auth_mod else extract_face_embedding


def _consume_invite_atomically(db: Session, token: str) -> Invite:
    """Validate and atomically mark a single-use invite as consumed."""
    token_hashed = hash_token(token.strip())
    invite = db.query(Invite).filter(Invite.token_hash == token_hashed).first()
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "invalid_invite", "message": "Invalid invite token"},
        )
    if invite.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invite_expired", "message": "This invitation has expired"},
        )

    now = datetime.utcnow()
    res = db.execute(
        update(Invite)
        .where(Invite.id == invite.id, Invite.used_at.is_(None))
        .values(used_at=now)
    )
    if res.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invite_used", "message": "This invite link has already been used"},
        )
    db.flush()
    return invite


@router.post("/apply")
def apply_membership(payload: ApplyRequest, db: Session = Depends(get_db)):
    """Invited student e-KYC application flow pending administrator approval."""
    invite = _consume_invite_atomically(db, payload.invite_token)
    existing = db.query(User).filter(User.email == invite.email.lower()).first()
    if existing:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "user_exists", "message": "A user with this email already exists"},
        )

    try:
        face_bytes, _, face_ext = decode_and_validate_base64(
            payload.face_photo, allow_pdf=False, max_bytes=MAX_PORTRAIT_BYTES
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_face_photo", "message": str(exc)},
        )

    embedding = None
    if is_face_engine_ready():
        embedding = _get_extract_fn()(payload.face_photo)
        if not embedding:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "face_not_detected", "message": "No clear human face detected in portrait photo"},
            )

    doc_path = None
    if payload.document_base64:
        try:
            doc_bytes, _, doc_ext = decode_and_validate_base64(
                payload.document_base64, allow_pdf=True, max_bytes=MAX_DOCUMENT_BYTES
            )
            doc_path = save_user_file(invite.id, "documents", doc_bytes, doc_ext)
        except ValueError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_document", "message": str(exc)},
            )

    face_path = save_user_file(invite.id, "faces", face_bytes, face_ext)
    user = User(
        email=invite.email.lower(),
        name=payload.name.strip()[:255],
        password_hash=hash_password(payload.password),
        role=invite.role,
        status="pending_approval",
        term_end=invite.term_end,
        face_embedding=embedding,
        document_path=doc_path,
        face_photo_path=face_path,
        require_face_match=True if embedding else False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_audit(
        db,
        action="application_submitted",
        actor_id=user.id,
        target_id=user.id,
        detail={"email": user.email, "role": user.role},
    )
    return {
        "status": "ok",
        "next": "pending_approval",
        "account_status": "pending_approval",
        "user_id": user.id,
        "message": "Your application has been submitted and is awaiting administrator approval.",
    }


@router.post("/register")
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    """Public or invite-backed e-KYC self-registration with mandatory face + ID validation."""
    if payload.consent_given is not True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "consent_required",
                "message": "Explicit informed data consent under DPDP Act 2023 is required.",
            },
        )

    email = (payload.email or "").strip().lower()
    if not email or not EMAIL_REGEX.match(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_email", "message": "Please enter a valid email address."},
        )

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "user_exists", "message": "An account or application with this email already exists."},
        )

    invite = None
    if payload.invite_token:
        invite = _consume_invite_atomically(db, payload.invite_token)

    try:
        face_bytes, _, face_ext = decode_and_validate_base64(
            payload.face_photo, allow_pdf=False, max_bytes=MAX_PORTRAIT_BYTES
        )
        doc_bytes, _, doc_ext = decode_and_validate_base64(
            payload.document_base64, allow_pdf=True, max_bytes=MAX_DOCUMENT_BYTES
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_upload", "message": str(exc)},
        )

    if not is_face_engine_ready():
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "biometric_engine_unavailable", "message": "Biometric verification engine unavailable"},
        )

    embedding = _get_extract_fn()(payload.face_photo)
    if not embedding:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "face_not_detected",
                "message": "No clear human face detected in your portrait photo. Ensure even lighting and look straight at the camera.",
            },
        )

    temp_key = email.replace("@", "_at_").replace(".", "_")[:24]
    face_path = save_user_file(temp_key, "faces", face_bytes, face_ext)
    doc_path = save_user_file(temp_key, "documents", doc_bytes, doc_ext)

    user = User(
        email=email,
        name=payload.name.strip()[:255],
        phone=(payload.phone or "").strip()[:50],
        password_hash=hash_password(payload.password),
        role=invite.role if invite else "member",
        status="pending_approval",
        term_end=invite.term_end if invite else None,
        face_embedding=embedding,
        document_path=doc_path,
        face_photo_path=face_path,
        require_face_match=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_audit(
        db,
        action="application_submitted",
        actor_id=user.id,
        target_id=user.id,
        detail={"email": user.email, "method": "public_ekyc_registration", "consent_given": True},
    )

    admin_user = db.query(User).filter(User.role == "admin", User.status == "active").first()
    admin_email = ADMIN_CONTACT_EMAIL or (admin_user.email if admin_user else None)
    send_application_submitted_emails(
        applicant_name=user.name,
        applicant_email=user.email,
        admin_email=admin_email,
        org_name=ORG_NAME or "Jadavpur University Societies",
        background=True,
    )

    return {
        "status": "pending_approval",
        "user_id": user.id,
        "message": "Application received! Once verified by an administrator, your credentials will be activated.",
    }


@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    """Invite-gated direct account activation (requires invite_token unless ALLOW_OPEN_SIGNUP=true)."""
    if payload.consent_given is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "consent_required",
                "message": "Explicit consent under DPDP Act 2023 is required to enroll.",
            },
        )

    invite = None
    target_email = (payload.email or "").strip().lower()
    target_role = "member"
    target_term = None

    if payload.invite_token:
        invite = _consume_invite_atomically(db, payload.invite_token)
        target_email = invite.email.lower()
        target_role = invite.role
        target_term = invite.term_end
    elif not ALLOW_OPEN_SIGNUP:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "invite_required",
                "message": "Direct signup requires an administrator invitation token. Please use /register for public e-KYC applications.",
            },
        )

    if not target_email or not EMAIL_REGEX.match(target_email):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_email", "message": "Valid email address is required"},
        )

    if db.query(User).filter(User.email == target_email).first():
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "user_exists", "message": "User with this email already exists"},
        )

    user = User(
        email=target_email,
        name=payload.name.strip()[:255],
        phone=(payload.phone or "").strip()[:50] or None,
        password_hash=hash_password(payload.password),
        role=target_role,
        status="active",
        term_end=target_term,
        last_active_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_audit(
        db,
        action="signup",
        actor_id=user.id,
        target_id=user.id,
        detail={"role": user.role, "invited": bool(invite), "consent_given": True},
    )

    login_ticket = create_signed_ticket(user.id, purpose="liveness")
    return {
        "status": "ok",
        "user_id": user.id,
        "email": user.email,
        "next": "liveness",
        "login_ticket": login_ticket,
        "message": "Account created. Complete live human verification to continue.",
    }
