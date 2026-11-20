import os
import uuid
import base64
from datetime import datetime, date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Invite, Product, SsoSession, RefreshToken, AuditLog, RenewalRequest
from app.security import (
    hash_token,
    generate_random_token,
    hash_password
)
from app.audit import log_audit
from app.config import FRONTEND_ORIGIN, PURGE_GRACE_HOURS
from app.deps import require_admin_user
from app.jobs.cleanup import run_cleanup_job
from app.services.email_service import send_mark_as_left_email, send_renewal_status_email

router = APIRouter(prefix="/admin", tags=["admin"])

class CreateInviteRequest(BaseModel):
    email: str
    role: str = "member"
    term_end: Optional[date] = None

class DisableRequest(BaseModel):
    reason: str = "admin"

class CreateProductRequest(BaseModel):
    name: str
    redirect_uri: str

@router.post("/invites")
def create_invite(
    payload: CreateInviteRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """M1: Admin invites a member and optionally sets term_end."""
    raw_token = generate_random_token(32)
    token_h = hash_token(raw_token)
    expires_at = datetime.utcnow() + timedelta(days=7)

    invite = Invite(
        email=payload.email,
        role=payload.role,
        term_end=payload.term_end,
        token_hash=token_h,
        expires_at=expires_at,
        created_by=admin.id
    )
    db.add(invite)
    db.commit()

    log_audit(
        db,
        action="invite_created",
        actor_id=admin.id,
        detail={"email": payload.email, "role": payload.role}
    )

    invite_url = f"{FRONTEND_ORIGIN}/signup?token={raw_token}"
    return {
        "status": "ok",
        "invite_id": invite.id,
        "invite_token": raw_token,
        "link": invite_url,
        "expires_at": expires_at.isoformat()
    }

@router.get("/invites")
def list_invites(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """List all invites and their current status."""
    invites = db.query(Invite).order_by(Invite.expires_at.desc()).all()
    now = datetime.utcnow()
    res = []
    for inv in invites:
        if inv.used_at:
            status = "accepted"
        elif inv.expires_at < now:
            status = "expired"
        else:
            status = "pending"
        res.append({
            "id": inv.id,
            "email": inv.email,
            "role": inv.role,
            "term_end": inv.term_end.isoformat() if inv.term_end else None,
            "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
            "used_at": inv.used_at.isoformat() if inv.used_at else None,
            "status": status,
        })
    return res

@router.get("/users")
def list_users(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """List users, optionally filtered by status."""
    query = db.query(User)
    if status:
        query = query.filter(User.status == status)

    users = query.order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "phone": u.phone,
            "role": u.role,
            "status": u.status,
            "term_end": str(u.term_end) if u.term_end else None,
            "last_active_at": u.last_active_at.isoformat() if u.last_active_at else None,
            "liveness_passed_at": u.liveness_passed_at.isoformat() if u.liveness_passed_at else None,
            "disabled_at": u.disabled_at.isoformat() if u.disabled_at else None,
            "disabled_reason": u.disabled_reason,
            "created_at": u.created_at.isoformat()
        }
        for u in users
    ]

@router.post("/users/{user_id}/mark-left")
def mark_user_left(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """
    M5/FR2: 'Mark as left' instantly blocks all connected products.
    Revokes the SSO session and all refresh tokens immediately.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "User not found"}
        )

    now = datetime.utcnow()
    user.status = "disabled"
    user.disabled_reason = "left"
    user.disabled_at = now

    # Revoke all SSO sessions
    db.query(SsoSession).filter(
        SsoSession.user_id == user.id,
        SsoSession.revoked_at.is_(None)
    ).update({"revoked_at": now})

    # Revoke all refresh tokens
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": now})

    db.commit()

    log_audit(
        db,
        action="user_marked_left",
        actor_id=admin.id,
        target_id=user.id,
        detail={"user_email": user.email}
    )

    # Send 48-hour recovery/purge notice email with renew link
    renew_url = f"{FRONTEND_ORIGIN}/renew?email={user.email}"
    try:
        send_mark_as_left_email(user.email, user.name, renew_url)
    except Exception:
        pass

    return {
        "status": "ok",
        "message": f"User {user.email} marked as left. All active sessions and tokens revoked. 48-hour purge window initialized."
    }

@router.post("/users/{user_id}/disable")
def disable_user(
    user_id: str,
    payload: DisableRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """Disable user account and revoke sessions."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "User not found"}
        )

    now = datetime.utcnow()
    user.status = "disabled"
    user.disabled_reason = payload.reason
    user.disabled_at = now

    db.query(SsoSession).filter(
        SsoSession.user_id == user.id,
        SsoSession.revoked_at.is_(None)
    ).update({"revoked_at": now})

    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": now})

    db.commit()

    log_audit(
        db,
        action="access_denied",
        actor_id=admin.id,
        target_id=user.id,
        detail={"reason": payload.reason, "disabled_by_admin": True}
    )

    return {"status": "ok", "message": f"User {user.email} disabled"}

@router.post("/users/{user_id}/enable")
def enable_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """Re-enable a disabled user account."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "User not found"}
        )

    user.status = "active"
    user.disabled_reason = None
    user.disabled_at = None
    db.commit()

    log_audit(
        db,
        action="user_enabled",
        actor_id=admin.id,
        target_id=user.id,
        detail={"user_email": user.email}
    )

    return {"status": "ok", "message": f"User {user.email} re-enabled"}

@router.post("/users/{user_id}/delete-request")
def delete_request(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """FR3: Request deletion. Allowed only if user is already disabled."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "User not found"}
        )

    if user.status != "disabled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "account_not_disabled", "message": "Account must be disabled before requesting deletion"}
        )

    log_audit(
        db,
        action="delete_requested",
        actor_id=admin.id,
        target_id=user.id,
        detail={"user_email": user.email}
    )

    return {
        "status": "ok",
        "message": f"Deletion requested for {user.email}. Requires 30-day waiting period from disabled date."
    }

@router.post("/users/{user_id}/delete-approve")
def delete_approve(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """
    FR3: Approve deletion. Needs: account already disabled, 30 days passed, and admin approval.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "User not found"}
        )

    if user.status != "disabled" or not user.disabled_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "not_eligible", "message": "Account must be in disabled status to approve deletion"}
        )

    # Check 30-day requirement
    days_disabled = (datetime.utcnow() - user.disabled_at).days
    if days_disabled < 30:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "waiting_period_active",
                "message": f"Must wait 30 days after account was disabled. Current: {days_disabled} days."
            }
        )

    user.status = "deleted"
    db.commit()

    log_audit(
        db,
        action="delete_approved",
        actor_id=admin.id,
        target_id=user.id,
        detail={"user_email": user.email, "days_disabled": days_disabled}
    )

    return {"status": "ok", "message": f"Account {user.email} permanently marked as deleted"}

@router.post("/products")
def register_product(
    payload: CreateProductRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """FR6: Product registration. Returns client_id and client_secret (shown once)."""
    client_id = f"prod_{uuid.uuid4().hex[:12]}"
    raw_secret = f"sec_{generate_random_token(32)}"
    secret_h = hash_token(raw_secret)

    product = Product(
        name=payload.name,
        client_id=client_id,
        client_secret_hash=secret_h,
        redirect_uri=payload.redirect_uri
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    log_audit(
        db,
        action="product_registered",
        actor_id=admin.id,
        target_id=product.id,
        detail={"product_name": product.name, "client_id": client_id}
    )

    return {
        "status": "ok",
        "product_id": product.id,
        "name": product.name,
        "client_id": client_id,
        "client_secret": raw_secret,
        "redirect_uri": product.redirect_uri
    }

@router.get("/audit")
def get_audit_log(
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """FR7: Newest first audit log entries."""
    entries = db.query(AuditLog).order_by(AuditLog.at.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "at": e.at.isoformat(),
            "actor_id": e.actor_id,
            "action": e.action,
            "target_id": e.target_id,
            "detail": e.detail
        }
        for e in entries
    ]

@router.post("/cleanup/run")
def trigger_cleanup(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """Run the cleanup job on demand (e.g. for demo)."""
    result = run_cleanup_job(db)
    return result

# ==============================================================================
# e-KYC & Membership Application Approval Desk
# ==============================================================================

@router.get("/applications")
def list_pending_applications(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """
    List all membership applications currently in 'pending_approval' status.
    Allows administrators to review captured face portraits and supporting documents.
    """
    pending_users = db.query(User).filter(
        User.status == "pending_approval"
    ).order_by(User.created_at.desc()).all()

    results = []
    for u in pending_users:
        doc_filename = None
        doc_data_url = None
        if u.document_path and os.path.exists(u.document_path):
            doc_filename = os.path.basename(u.document_path)
            # Remove UUID prefix for clean user-facing display
            if "_" in doc_filename:
                doc_filename = doc_filename.split("_", 1)[1]
            try:
                ext = os.path.splitext(u.document_path)[1].lower()
                mime = "application/pdf" if ext == ".pdf" else "image/jpeg"
                if ext == ".png":
                    mime = "image/png"
                with open(u.document_path, "rb") as f:
                    doc_data_url = f"data:{mime};base64,{base64.b64encode(f.read()).decode('utf-8')}"
            except Exception:
                pass

        face_data_url = None
        if u.face_photo_path and os.path.exists(u.face_photo_path):
            try:
                with open(u.face_photo_path, "rb") as f:
                    face_data_url = f"data:image/jpeg;base64,{base64.b64encode(f.read()).decode('utf-8')}"
            except Exception:
                pass

        results.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "phone": u.phone,
            "role": u.role,
            "term_end": u.term_end.isoformat() if u.term_end else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "has_face_photo": bool(u.face_photo_path and os.path.exists(u.face_photo_path)),
            "face_data_url": face_data_url,
            "has_document": bool(u.document_path and os.path.exists(u.document_path)),
            "document_data_url": doc_data_url,
            "document_name": doc_filename,
            "face_url": f"/admin/files/face/{u.id}",
            "document_url": f"/admin/files/document/{u.id}"
        })

    return results

@router.post("/applications/{user_id}/approve")
def approve_application(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """
    Approve an e-KYC membership application.
    Transitions account to 'active' status and activates biometric face identity verification.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "Applicant record not found"}
        )

    if user.status != "pending_approval":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "not_pending", "message": f"User is not pending approval (status: {user.status})"}
        )

    now = datetime.utcnow()
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
        detail={"applicant_email": user.email, "applicant_name": user.name}
    )

    return {
        "status": "ok",
        "message": f"Application for {user.name} ({user.email}) has been approved. The member can now log in.",
        "user": {
            "id": user.id,
            "email": user.email,
            "status": user.status
        }
    }

@router.post("/applications/{user_id}/reject")
def reject_application(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """
    Reject an e-KYC membership application.
    Transitions account to 'disabled' with reason 'application_rejected'.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "Applicant record not found"}
        )

    now = datetime.utcnow()
    user.status = "disabled"
    user.disabled_reason = "application_rejected"
    user.disabled_at = now
    db.commit()

    log_audit(
        db,
        action="application_rejected",
        actor_id=admin.id,
        target_id=user.id,
        detail={"applicant_email": user.email, "applicant_name": user.name}
    )

    return {
        "status": "ok",
        "message": f"Application for {user.name} ({user.email}) has been rejected."
    }

@router.get("/files/face/{user_id}")
def get_applicant_face_photo(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """Serve applicant captured face portrait for admin preview."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.face_photo_path or not os.path.exists(user.face_photo_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face portrait not found")
    return FileResponse(user.face_photo_path, media_type="image/jpeg")

@router.get("/files/document/{user_id}")
def get_applicant_document(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """Serve applicant supporting document for admin preview."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.document_path or not os.path.exists(user.document_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document file not found")
    
    # Infer content type
    ext = os.path.splitext(user.document_path)[1].lower()
    media_type = "application/pdf" if ext == ".pdf" else "image/jpeg"
    if ext == ".png":
        media_type = "image/png"

    return FileResponse(user.document_path, media_type=media_type)

# ==============================================================================
# 48-Hour Accidental Revocation & Expiration Renewal Desk
# ==============================================================================

class RenewalActionRequest(BaseModel):
    notes: Optional[str] = None

@router.get("/renewals")
def list_renewal_requests(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """
    List all membership renewal requests with dynamic 48-hour purge countdown timers.
    """
    requests = db.query(RenewalRequest).order_by(RenewalRequest.created_at.desc()).all()
    now = datetime.utcnow()
    results = []
    for r in requests:
        user = db.query(User).filter(User.id == r.user_id).first()
        hours_left = 0.0
        if user and user.disabled_at:
            elapsed = (now - user.disabled_at).total_seconds() / 3600.0
            hours_left = max(0.0, round(PURGE_GRACE_HOURS - elapsed, 1))

        results.append({
            "id": r.id,
            "user_id": r.user_id,
            "email": r.email,
            "name": r.name,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            "admin_notes": r.admin_notes,
            "user_status": user.status if user else "purged",
            "disabled_at": user.disabled_at.isoformat() if user and user.disabled_at else None,
            "disabled_reason": user.disabled_reason if user else None,
            "hours_left": hours_left
        })
    return results

@router.post("/renewals/{request_id}/approve")
def approve_renewal_request(
    request_id: str,
    payload: Optional[RenewalActionRequest] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """
    Approve a renewal request: Reactivate user account and cancel 48h purge countdown.
    Sends confirmation email to user.
    """
    req = db.query(RenewalRequest).filter(RenewalRequest.id == request_id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Renewal request not found"}
        )

    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_purged", "message": "User has already been purged from database"}
        )

    now = datetime.utcnow()
    req.status = "approved"
    req.resolved_at = now
    req.resolved_by = admin.id
    if payload and payload.notes:
        req.admin_notes = payload.notes

    # Reactivate user account
    user.status = "active"
    user.disabled_at = None
    user.disabled_reason = None
    user.last_active_at = now
    db.commit()

    log_audit(
        db,
        action="renewal_approved",
        actor_id=admin.id,
        target_id=user.id,
        detail={"email": user.email, "request_id": req.id}
    )

    try:
        send_renewal_status_email(user.email, user.name, "approved", req.admin_notes)
    except Exception:
        pass

    return {
        "status": "ok",
        "message": f"Renewal approved for {user.name} ({user.email}). Account access is restored.",
        "user": {
            "id": user.id,
            "email": user.email,
            "status": user.status
        }
    }

@router.post("/renewals/{request_id}/decline")
def decline_renewal_request(
    request_id: str,
    payload: Optional[RenewalActionRequest] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user)
):
    """
    Decline a renewal request: Marks request as declined and informs user via email.
    """
    req = db.query(RenewalRequest).filter(RenewalRequest.id == request_id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Renewal request not found"}
        )

    now = datetime.utcnow()
    req.status = "declined"
    req.resolved_at = now
    req.resolved_by = admin.id
    if payload and payload.notes:
        req.admin_notes = payload.notes
    db.commit()

    user = db.query(User).filter(User.id == req.user_id).first()
    if user:
        log_audit(
            db,
            action="renewal_declined",
            actor_id=admin.id,
            target_id=user.id,
            detail={"email": user.email, "request_id": req.id}
        )
        try:
            send_renewal_status_email(user.email, user.name, "declined", req.admin_notes)
        except Exception:
            pass

    return {
        "status": "ok",
        "message": f"Renewal request for {req.email} has been declined."
    }
