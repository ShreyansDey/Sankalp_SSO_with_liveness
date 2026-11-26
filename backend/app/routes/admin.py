from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import ORG_NAME, PURGE_GRACE_HOURS, resolve_frontend_origin
from app.database import get_db
from app.deps import require_admin_user
from app.jobs.cleanup import run_cleanup_job
from app.models import (
    AuditLog,
    Invite,
    Product,
    RefreshToken,
    RenewalRequest,
    SsoSession,
    User,
)
from app.routes.admin_applications import router as applications_router
from app.routes.admin_facelock import router as facelock_router
from app.schemas.admin import CreateInviteRequest, CreateProductRequest, DisableRequest, RenewalActionRequest
from app.security import generate_random_token, hash_token
from app.services.face_engine import extract_face_embedding  # noqa: F401
from app.services.email_service import (
    send_invite_email,
    send_mark_as_left_email,
    send_renewal_status_email,
    to_ist_str,
)

router = APIRouter(prefix="/admin", tags=["Admin"])
router.include_router(applications_router)
router.include_router(facelock_router)


@router.post("/invites")
def create_invite(
    payload: CreateInviteRequest,
    request: Request = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Admin invites a member and optionally sets term_end."""
    raw_token = generate_random_token(32)
    expires_at = datetime.utcnow() + timedelta(days=7)

    invite = Invite(
        email=payload.email.strip().lower(),
        role=payload.role,
        term_end=payload.term_end,
        token_hash=hash_token(raw_token),
        expires_at=expires_at,
        created_by=admin.id,
    )
    db.add(invite)
    db.commit()

    log_audit(db, action="invite_created", actor_id=admin.id, detail={"email": invite.email, "role": payload.role})

    base_origin = resolve_frontend_origin(request)
    invite_url = f"{base_origin}/register?token={raw_token}"

    send_invite_email(
        to_email=invite.email,
        invite_link=invite_url,
        role=payload.role,
        term_end=str(payload.term_end) if payload.term_end else None,
        org_name=ORG_NAME or "Recognized Campus Societies",
        background=True,
    )
    return {
        "status": "ok",
        "invite_id": invite.id,
        "invite_token": raw_token,
        "link": invite_url,
        "expires_at": expires_at.isoformat(),
    }


@router.get("/invites")
def list_invites(db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    """List all invites and their current status."""
    invites = db.query(Invite).order_by(Invite.expires_at.desc()).all()
    now = datetime.utcnow()
    res = []
    for inv in invites:
        inv_status = "accepted" if inv.used_at else ("expired" if inv.expires_at < now else "pending")
        res.append(
            {
                "id": inv.id,
                "email": inv.email,
                "role": inv.role,
                "term_end": inv.term_end.isoformat() if inv.term_end else None,
                "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
                "used_at": inv.used_at.isoformat() if inv.used_at else None,
                "status": inv_status,
            }
        )
    return res


@router.get("/users")
def list_users(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
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
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.post("/users/{user_id}/mark-left")
def mark_user_left(
    user_id: str,
    request: Request = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    """Instant offboarding: disable account and revoke every session & refresh token atomically."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "user_not_found", "message": "User not found"})
    if user.role == "admin":
        raise HTTPException(
            status_code=400,
            detail={"error": "cannot_remove_admin", "message": "Administrator accounts cannot be marked as left."},
        )

    now = datetime.utcnow()
    user.status = "disabled"
    user.disabled_at = now
    user.disabled_reason = "left"

    rev_sessions = (
        db.query(SsoSession).filter(SsoSession.user_id == user.id, SsoSession.revoked_at.is_(None)).update({"revoked_at": now})
    )
    rev_tokens = (
        db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).update({"revoked_at": now})
    )
    db.commit()

    log_audit(
        db,
        action="user_marked_left",
        actor_id=admin.id,
        target_id=user.id,
        detail={"revoked_sessions": rev_sessions, "revoked_tokens": rev_tokens},
    )

    origin = resolve_frontend_origin(request)
    send_mark_as_left_email(to_email=user.email, name=user.name, renew_url=f"{origin}/renew?email={user.email}", background=True)
    return {
        "status": "ok",
        "message": f"User {user.email} marked as left and signed out of all products. 48-hour purge window initialized.",
        "revoked_sessions": rev_sessions,
        "revoked_tokens": rev_tokens,
    }


@router.post("/users/{user_id}/disable")
def disable_user(
    user_id: str,
    payload: DisableRequest = DisableRequest(),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "user_not_found", "message": "User not found"})
    if user.role == "admin":
        raise HTTPException(
            status_code=400,
            detail={"error": "cannot_remove_admin", "message": "Administrator accounts cannot be disabled."},
        )

    now = datetime.utcnow()
    user.status = "disabled"
    user.disabled_at = now
    user.disabled_reason = payload.reason
    db.query(SsoSession).filter(SsoSession.user_id == user.id, SsoSession.revoked_at.is_(None)).update({"revoked_at": now})
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).update({"revoked_at": now})
    db.commit()

    log_audit(db, action="user_disabled_auto", actor_id=admin.id, target_id=user.id, detail={"reason": payload.reason})
    return {"status": "ok", "message": f"User {user.email} disabled"}


@router.post("/users/{user_id}/enable")
def enable_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "user_not_found", "message": "User not found"})
    if user.status == "deleted":
        raise HTTPException(status_code=400, detail={"error": "cannot_enable", "message": "Account has been permanently deleted"})

    user.status = "active"
    user.disabled_at = None
    user.disabled_reason = None
    user.last_active_at = datetime.utcnow()
    db.commit()

    log_audit(db, action="user_enabled", actor_id=admin.id, target_id=user.id)
    return {"status": "ok", "message": f"User {user.email} re-enabled"}


@router.post("/users/{user_id}/delete-request")
def delete_request(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "user_not_found", "message": "User not found"})
    if user.role == "admin":
        raise HTTPException(status_code=400, detail={"error": "cannot_delete_admin", "message": "Admin accounts cannot be deleted."})
    if user.status != "disabled":
        raise HTTPException(status_code=400, detail={"error": "account_not_disabled", "message": "Account must be disabled first"})

    log_audit(db, action="delete_requested", actor_id=admin.id, target_id=user.id, detail={"user_email": user.email})
    return {"status": "ok", "message": f"Deletion requested for {user.email}. Requires 30-day waiting period from disabled date."}


@router.post("/users/{user_id}/delete-approve")
def delete_approve(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "user_not_found", "message": "User not found"})
    if user.role == "admin":
        raise HTTPException(status_code=400, detail={"error": "cannot_delete_admin", "message": "Admin accounts cannot be deleted."})
    if user.status != "disabled" or not user.disabled_at:
        raise HTTPException(status_code=400, detail={"error": "not_eligible", "message": "Account must be disabled to approve deletion"})

    days_disabled = (datetime.utcnow() - user.disabled_at).days
    if days_disabled < 30:
        raise HTTPException(
            status_code=400,
            detail={"error": "waiting_period_active", "message": f"Must wait 30 days after disabled. Current: {days_disabled} days."},
        )

    user.status = "deleted"
    db.commit()
    log_audit(db, action="delete_approved", actor_id=admin.id, target_id=user.id, detail={"user_email": user.email, "days_disabled": days_disabled})
    return {"status": "ok", "message": f"Account {user.email} permanently marked as deleted"}


@router.post("/products")
def register_product(payload: CreateProductRequest, db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    client_id = f"app_{generate_random_token(8)}"
    raw_secret = f"sec_{generate_random_token(24)}"
    product = Product(
        name=payload.name.strip(),
        client_id=client_id,
        client_secret_hash=hash_token(raw_secret),
        redirect_uri=payload.redirect_uri.strip(),
        allowed_origins=payload.allowed_origins,
        api_only=payload.api_only,
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    log_audit(db, action="product_registered", actor_id=admin.id, target_id=product.id, detail={"name": product.name, "client_id": product.client_id})
    return {
        "id": product.id,
        "name": product.name,
        "client_id": product.client_id,
        "client_secret": raw_secret,
        "redirect_uri": product.redirect_uri,
        "message": "Save this client_secret securely; it will not be shown again.",
    }


@router.get("/products")
def list_products(db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    return [
        {
            "id": p.id,
            "name": p.name,
            "client_id": p.client_id,
            "redirect_uri": p.redirect_uri,
            "allowed_origins": p.allowed_origins,
            "api_only": bool(p.api_only),
        }
        for p in db.query(Product).all()
    ]


@router.get("/audit")
def get_audit_log(
    action: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    logs = query.order_by(AuditLog.at.desc()).offset(offset).limit(limit).all()
    return [
        {
            "id": entry.id,
            "at": entry.at.isoformat(),
            "at_ist": to_ist_str(entry.at),
            "actor_id": entry.actor_id,
            "action": entry.action,
            "target_id": entry.target_id,
            "detail": entry.detail,
        }
        for entry in logs
    ]


@router.post("/cleanup/run")
def manual_cleanup_trigger(db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    summary = run_cleanup_job(db)
    return {**summary, "status": "ok", "summary": summary}


@router.get("/renewals")
def list_renewal_requests(db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    requests = db.query(RenewalRequest).order_by(RenewalRequest.created_at.desc()).all()
    now = datetime.utcnow()
    results = []
    for r in requests:
        user = db.query(User).filter(User.id == r.user_id).first()
        hours_left = 0.0
        if user and user.disabled_at:
            elapsed = (now - user.disabled_at).total_seconds() / 3600.0
            hours_left = max(0.0, round(PURGE_GRACE_HOURS - elapsed, 1))
        results.append(
            {
                "id": r.id,
                "user_id": r.user_id,
                "email": r.email,
                "name": r.name,
                "reason": r.reason,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "created_at_ist": to_ist_str(r.created_at) if r.created_at else None,
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
                "admin_notes": r.admin_notes,
                "user_status": user.status if user else "purged",
                "disabled_at": user.disabled_at.isoformat() if user and user.disabled_at else None,
                "disabled_reason": user.disabled_reason if user else None,
                "hours_left": hours_left,
            }
        )
    return results


@router.post("/renewals/{request_id}/approve")
def approve_renewal_request(
    request_id: str,
    payload: Optional[RenewalActionRequest] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    req = db.query(RenewalRequest).filter(RenewalRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "Renewal request not found"})
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "user_purged", "message": "User already purged"})

    now = datetime.utcnow()
    req.status = "approved"
    req.resolved_at = now
    req.resolved_by = admin.id
    if payload and payload.notes:
        req.admin_notes = payload.notes

    user.status = "active"
    user.disabled_at = None
    user.disabled_reason = None
    user.last_active_at = now
    db.commit()

    log_audit(db, action="renewal_approved", actor_id=admin.id, target_id=user.id, detail={"email": user.email, "request_id": req.id})
    send_renewal_status_email(user.email, user.name, "approved", req.admin_notes, background=True)
    return {"status": "ok", "message": f"Renewal approved for {user.name}.", "user": {"id": user.id, "email": user.email, "status": user.status}}


@router.post("/renewals/{request_id}/decline")
def decline_renewal_request(
    request_id: str,
    payload: Optional[RenewalActionRequest] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_user),
):
    req = db.query(RenewalRequest).filter(RenewalRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "Renewal request not found"})

    now = datetime.utcnow()
    req.status = "declined"
    req.resolved_at = now
    req.resolved_by = admin.id
    if payload and payload.notes:
        req.admin_notes = payload.notes
    db.commit()

    user = db.query(User).filter(User.id == req.user_id).first()
    if user:
        log_audit(db, action="renewal_declined", actor_id=admin.id, target_id=user.id, detail={"email": user.email, "request_id": req.id})
        send_renewal_status_email(user.email, user.name, "declined", req.admin_notes, background=True)
    return {"status": "ok", "message": "Renewal request declined."}
