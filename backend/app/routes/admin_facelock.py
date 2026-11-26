import secrets
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import ADMIN_CONTACT_EMAIL, UPLOAD_DIR
from app.database import get_db
from app.deps import require_admin_user
from app.models import AdminOtpToken, User
from app.schemas.admin import (
    AddAdminFaceRequest,
    ToggleRestrictionRequest,
    VerifyDisableOtpRequest,
)
from app.security import constant_time_compare, hash_token
from app.services.email_service import send_disable_face_lock_otp_email
from app.services.face_engine import extract_face_embedding, is_face_engine_ready
from app.services.storage_service import (
    MAX_PORTRAIT_BYTES,
    decode_and_validate_base64,
    erase_user_files,
    save_user_file,
)

router = APIRouter(tags=["Admin Biometric Face Lock"])
MAX_OTP_ATTEMPTS = 5


@router.get("/face-profiles")
def get_admin_face_profiles(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """List enrolled administrator face profiles and restriction status."""
    faces = admin.admin_faces if isinstance(admin.admin_faces, list) else []
    valid_faces = [f for f in faces if isinstance(f, dict) and f.get("embedding")]

    if len(valid_faces) == 0 and admin.require_face_match:
        admin.require_face_match = False
        db.commit()
        db.refresh(admin)

    return {
        "require_face_match": bool(admin.require_face_match and len(valid_faces) > 0),
        "faces": [
            {
                "id": f.get("id"),
                "label": f.get("label", "Admin Profile"),
                "photo_url": f"/admin/files/face-profile/{f.get('id')}",
                "created_at": f.get("created_at"),
            }
            for f in valid_faces
        ],
    }


@router.post("/face-profiles")
def add_admin_face_profile(
    payload: AddAdminFaceRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Enroll an authorized administrator face profile with validated image and 128D vector."""
    if not payload.face_photo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "missing_photo", "message": "Face photo is required"},
        )

    try:
        face_bytes, _, face_ext = decode_and_validate_base64(
            payload.face_photo, allow_pdf=False, max_bytes=MAX_PORTRAIT_BYTES
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_photo", "message": str(exc)},
        )

    if not is_face_engine_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "biometric_engine_unavailable", "message": "Biometric engine unavailable"},
        )

    admin_mod = sys.modules.get("app.routes.admin")
    extract_fn = getattr(admin_mod, "extract_face_embedding", extract_face_embedding) if admin_mod else extract_face_embedding
    embedding = extract_fn(payload.face_photo)
    if embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "face_not_detected",
                "message": "Could not detect a clear human face in the photo. Ensure even lighting.",
            },
        )

    face_id = str(uuid.uuid4())
    saved_path = save_user_file(f"admin_{face_id}", "faces", face_bytes, face_ext)

    new_profile = {
        "id": face_id,
        "label": payload.label.strip()[:100] or "Admin Face",
        "embedding": embedding,
        "photo_path": saved_path,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }

    current_faces = list(admin.admin_faces) if isinstance(admin.admin_faces, list) else []
    current_faces.append(new_profile)
    admin.admin_faces = current_faces
    if not admin.face_embedding:
        admin.face_embedding = embedding
    admin.require_face_match = True

    db.commit()
    db.refresh(admin)

    log_audit(
        db,
        action="admin_face_enrolled",
        actor_id=admin.id,
        target_id=admin.id,
        detail={"face_id": face_id, "label": new_profile["label"]},
    )

    return {
        "status": "ok",
        "message": f"Authorized face profile '{new_profile['label']}' enrolled successfully.",
        "face": {
            "id": face_id,
            "label": new_profile["label"],
            "photo_url": f"/admin/files/face-profile/{face_id}",
            "created_at": new_profile["created_at"],
        },
        "require_face_match": admin.require_face_match,
    }


@router.delete("/face-profiles/{face_id}")
def delete_admin_face_profile(
    face_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Remove an enrolled administrator face profile and clean up disk snapshot."""
    current_faces = list(admin.admin_faces) if isinstance(admin.admin_faces, list) else []
    deleted_face = next((f for f in current_faces if isinstance(f, dict) and f.get("id") == face_id), None)
    if deleted_face:
        erase_user_files(deleted_face.get("photo_path"))

    updated_faces = [f for f in current_faces if isinstance(f, dict) and f.get("id") != face_id]
    admin.admin_faces = updated_faces
    if not updated_faces:
        admin.require_face_match = False
        admin.face_embedding = None
    elif admin.face_embedding and not any(f.get("embedding") == admin.face_embedding for f in updated_faces):
        admin.face_embedding = updated_faces[0].get("embedding")

    db.commit()
    db.refresh(admin)

    log_audit(db, action="admin_face_deleted", actor_id=admin.id, target_id=admin.id, detail={"face_id": face_id})
    return {
        "status": "ok",
        "message": "Authorized face profile removed.",
        "require_face_match": admin.require_face_match,
    }


@router.post("/face-profiles/toggle-restriction")
def toggle_admin_face_restriction(
    payload: ToggleRestrictionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Enable biometric face lock (disabling requires 2-step email OTP)."""
    current_faces = list(admin.admin_faces) if isinstance(admin.admin_faces, list) else []
    valid_faces = [f for f in current_faces if isinstance(f, dict) and f.get("embedding")]

    if payload.enforce and len(valid_faces) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "no_face_enrolled",
                "message": "Enroll at least one authorized administrator face profile before enabling lock.",
            },
        )

    if not payload.enforce and admin.require_face_match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "2fa_required",
                "message": "Disabling Biometric Face Lock requires 2-Step Email OTP Verification.",
            },
        )

    admin.require_face_match = payload.enforce
    db.commit()
    db.refresh(admin)

    log_audit(
        db,
        action="admin_face_restriction_toggled",
        actor_id=admin.id,
        target_id=admin.id,
        detail={"require_face_match": admin.require_face_match},
    )
    return {
        "status": "ok",
        "require_face_match": admin.require_face_match,
        "message": f"Biometric face lock {'enforced' if admin.require_face_match else 'disabled'} for administrator logins.",
    }


@router.post("/face-profiles/request-disable-otp")
def request_disable_face_lock_otp(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Generate and email a DB-persisted hashed 6-digit OTP (multi-worker safe, never logged)."""
    target_email = admin.email or ADMIN_CONTACT_EMAIL or "teamsankalp60@gmail.com"
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    now = datetime.utcnow()

    # Invalidate prior unused OTPs for this admin
    db.query(AdminOtpToken).filter(
        AdminOtpToken.user_id == admin.id,
        AdminOtpToken.used_at.is_(None),
    ).update({"used_at": now})

    otp_row = AdminOtpToken(
        user_id=admin.id,
        otp_hash=hash_token(otp_code),
        attempts=0,
        expires_at=now + timedelta(minutes=5),
    )
    db.add(otp_row)
    db.commit()

    log_audit(db, action="otp_requested", actor_id=admin.id, target_id=admin.id, detail={"purpose": "disable_face_lock"})
    send_disable_face_lock_otp_email(
        to_email=target_email,
        admin_name=admin.name or "Administrator",
        otp_code=otp_code,
    )

    return {
        "status": "ok",
        "message": f"Verification code dispatched to {target_email}",
        "email": target_email,
        "expires_in_seconds": 300,
    }


@router.post("/face-profiles/verify-disable-otp")
def verify_disable_face_lock_otp(
    payload: VerifyDisableOtpRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Verify DB-stored 6-digit OTP with brute-force attempt limit and disable face lock."""
    now = datetime.utcnow()
    record = (
        db.query(AdminOtpToken)
        .filter(AdminOtpToken.user_id == admin.id, AdminOtpToken.used_at.is_(None))
        .order_by(AdminOtpToken.created_at.desc())
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "no_active_otp", "message": "No active verification code found. Request a new code."},
        )

    if now > record.expires_at:
        record.used_at = now
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "otp_expired", "message": "Verification code expired. Request a new code."},
        )

    if record.attempts >= MAX_OTP_ATTEMPTS:
        record.used_at = now
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "otp_locked", "message": "Maximum OTP attempts exceeded. Request a new code."},
        )

    if not constant_time_compare(hash_token(payload.otp.strip()), record.otp_hash):
        record.attempts += 1
        if record.attempts >= MAX_OTP_ATTEMPTS:
            record.used_at = now
        db.commit()
        log_audit(db, action="otp_failed", actor_id=admin.id, target_id=admin.id, detail={"attempts": record.attempts})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_otp", "message": "Invalid verification code. Check your email and try again."},
        )

    res = db.execute(
        update(AdminOtpToken)
        .where(AdminOtpToken.id == record.id, AdminOtpToken.used_at.is_(None))
        .values(used_at=now)
    )
    if res.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "no_active_otp", "message": "OTP already consumed."},
        )

    admin.require_face_match = False
    db.commit()
    db.refresh(admin)

    log_audit(
        db,
        action="admin_face_restriction_toggled",
        actor_id=admin.id,
        target_id=admin.id,
        detail={"require_face_match": False, "method": "email_2fa_otp"},
    )
    return {
        "status": "ok",
        "require_face_match": False,
        "message": "Biometric face lock disabled successfully via 2-Step Verification.",
    }


@router.get("/files/face-profile/{face_id}")
def get_admin_face_photo(
    face_id: str,
    admin: User = Depends(require_admin_user),
):
    """Serve enrolled administrator face snapshot safely from admin's profile list."""
    current_faces = list(admin.admin_faces) if isinstance(admin.admin_faces, list) else []
    face_entry = next((f for f in current_faces if isinstance(f, dict) and f.get("id") == face_id), None)
    if not face_entry or not face_entry.get("photo_path"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face portrait not found")
    path = Path(face_entry["photo_path"]).resolve()
    if not str(path).startswith(str(UPLOAD_DIR)) or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face portrait not found")
    return FileResponse(str(path), media_type="image/jpeg")
