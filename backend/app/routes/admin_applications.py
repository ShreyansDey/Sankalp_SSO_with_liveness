import sys
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import ORG_NAME, UPLOAD_DIR
from app.database import get_db
from app.deps import require_admin_user
from app.models import User
from app.schemas.admin import RejectApplicationRequest
from app.services.email_service import send_application_approved_email, send_application_rejected_email
from app.services.face_engine import extract_face_embedding
from app.services.storage_service import erase_user_files, read_safe_upload_as_data_uri

router = APIRouter(tags=["Admin e-KYC Applications"])


@router.get("/applications")
def list_pending_applications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    include_blobs: bool = Query(True),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """List pending e-KYC membership applications with safe pagination and optional inline preview blobs."""
    apps = (
        db.query(User)
        .filter(User.status == "pending_approval")
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    results = []
    for u in apps:
        has_face = bool(u.face_photo_path and Path(u.face_photo_path).exists())
        has_doc = bool(u.document_path and Path(u.document_path).exists())
        results.append(
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "phone": u.phone,
                "role": u.role,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "has_face_photo": has_face,
                "has_document": has_doc,
                "has_face_embedding": bool(u.face_embedding),
                "face_photo_url": f"/admin/files/face/{u.id}" if has_face else None,
                "document_url": f"/admin/files/document/{u.id}" if has_doc else None,
                "face_photo_b64": read_safe_upload_as_data_uri(u.face_photo_path) if (include_blobs and has_face) else None,
                "document_b64": read_safe_upload_as_data_uri(u.document_path) if (include_blobs and has_doc) else None,
            }
        )
    return results


@router.post("/applications/{user_id}/approve")
def approve_application(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Approve an e-KYC application, preserve 128D embedding, and purge raw files immediately (DPDP 2023)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "Applicant record not found"},
        )

    if user.status != "pending_approval":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "not_pending", "message": f"User is not pending approval (status: {user.status})"},
        )

    now = datetime.utcnow()
    if not user.face_embedding and user.face_photo_path and Path(user.face_photo_path).exists():
        try:
            admin_mod = sys.modules.get("app.routes.admin")
            extract_fn = getattr(admin_mod, "extract_face_embedding", extract_face_embedding) if admin_mod else extract_face_embedding
            emb = extract_fn(user.face_photo_path)
            if emb:
                user.face_embedding = emb
        except Exception:
            pass

    purged_files = []
    if user.document_path:
        if erase_user_files(user.document_path) > 0:
            purged_files.append("document")
        user.document_path = None
    if user.face_photo_path:
        if erase_user_files(user.face_photo_path) > 0:
            purged_files.append("face_photo")
        user.face_photo_path = None

    user.status = "active"
    user.approved_at = now
    user.approved_by = admin.id
    user.last_active_at = now
    db.commit()

    log_audit(
        db,
        action="application_approved",
        actor_id=admin.id,
        target_id=user.id,
        detail={
            "applicant_email": user.email,
            "applicant_name": user.name,
            "purged_files": purged_files,
            "privacy_compliance": "DPDP_2023_immediate_erasure",
        },
    )

    send_application_approved_email(
        to_email=user.email,
        name=user.name,
        org_name=ORG_NAME or "Recognized Campus Societies",
        background=True,
    )

    return {
        "status": "ok",
        "message": f"Application for {user.name} ({user.email}) has been approved. The member can now log in.",
        "user": {
            "id": user.id,
            "email": user.email,
            "status": user.status,
            "purged_files": purged_files,
        },
    }


@router.post("/applications/{user_id}/reject")
def reject_application(
    user_id: str,
    payload: Optional[RejectApplicationRequest] = Body(default=None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Reject an e-KYC application with optional reason and immediately erase submitted files."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "Applicant record not found"},
        )

    if user.status != "pending_approval":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "not_pending", "message": f"User is not pending approval (status: {user.status})"},
        )

    reason = payload.reason.strip() if (payload and payload.reason and payload.reason.strip()) else None
    purged_files = []
    if user.document_path:
        if erase_user_files(user.document_path) > 0:
            purged_files.append("document")
        user.document_path = None
    if user.face_photo_path:
        if erase_user_files(user.face_photo_path) > 0:
            purged_files.append("face_photo")
        user.face_photo_path = None

    user.status = "disabled"
    user.disabled_at = datetime.utcnow()
    user.disabled_reason = "application_rejected"
    user.face_embedding = None
    db.commit()

    log_audit(
        db,
        action="application_rejected",
        actor_id=admin.id,
        target_id=user.id,
        detail={
            "applicant_email": user.email,
            "reason": reason,
            "purged_files": purged_files,
            "privacy_compliance": "DPDP_2023_immediate_erasure",
        },
    )

    send_application_rejected_email(
        to_email=user.email,
        name=user.name,
        reason=reason,
        org_name=ORG_NAME or "Recognized Campus Societies",
        background=True,
    )

    return {
        "status": "ok",
        "message": f"Application for {user.name} ({user.email}) has been rejected and documents purged.",
    }


@router.get("/files/face/{user_id}")
def get_applicant_face_photo(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Serve applicant face portrait within UPLOAD_DIR safely."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.face_photo_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face portrait not found")
    path = Path(user.face_photo_path).resolve()
    if not str(path).startswith(str(UPLOAD_DIR)) or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face portrait not found")
    return FileResponse(str(path), media_type="image/jpeg")


@router.get("/files/document/{user_id}")
def get_applicant_document(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Serve applicant supporting document within UPLOAD_DIR safely."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.document_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document file not found")
    path = Path(user.document_path).resolve()
    if not str(path).startswith(str(UPLOAD_DIR)) or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document file not found")
    ext = path.suffix.lower()
    media_type = "application/pdf" if ext == ".pdf" else ("image/png" if ext == ".png" else "image/jpeg")
    return FileResponse(str(path), media_type=media_type)
