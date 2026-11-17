import uuid
from datetime import datetime, date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Invite, Product, SsoSession, RefreshToken, AuditLog
from app.security import (
    hash_token,
    generate_random_token,
    hash_password
)
from app.audit import log_audit
from app.config import FRONTEND_ORIGIN
from app.deps import require_admin_user
from app.jobs.cleanup import run_cleanup_job

router = APIRouter(prefix="/admin", tags=["admin"])

class CreateInviteRequest(BaseModel):
    email: EmailStr
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

    return {
        "status": "ok",
        "message": f"User {user.email} marked as left. All active sessions and tokens revoked."
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
