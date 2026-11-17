# 04 — Admin Dashboard

**Status:** done · **Owner:** Arka · **Date:** 2026-11-17

## 1. What it is (plain words)
The Admin Dashboard gives organization managers full visibility and control over team members, invited users, connected products, and access lifecycles. It includes the critical "Mark as Left" capability that instantly terminates a departing member's access across all connected systems in a single click.

## 2. Why it exists
Covers requirements **M5** ("Mark as left" blocks all products at once), **FR2** (disabling revokes SSO session and refresh tokens immediately), **FR3** (30-day disable requirement for deletion approval), and **FR6** (product registration).

## 3. How it works
1. **Access Control**: Only users with `role = 'admin'` can access `/admin/*` routes or the admin UI.
2. **Instant Removal ("Mark as Left")**:
   - Updates `user.status = 'disabled'`, `user.disabled_reason = 'left'`, and records `disabled_at = datetime.utcnow()`.
   - In the same database transaction, revokes all active `sso_sessions` and all `refresh_tokens`.
   - Connected applications immediately deny access upon their next request or token refresh.
3. **Invitation Management**:
   - Admins generate invitations with specific roles (`member` or `admin`) and optional `term_end` dates.
4. **Product Registration**:
   - Generates client IDs and secrets for external applications, enforcing registered redirect URIs.
5. **Deletion Safeguard**:
   - Account deletion requires the user to already be disabled for at least 30 days before admin approval is accepted.

## 4. Code

### `backend/app/routes/admin.py`
```python
# backend/app/routes/admin.py
@router.post("/users/{user_id}/mark-left")
def mark_user_left(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail={"error": "user_not_found", "message": "User not found"})

    now = datetime.utcnow()
    user.status = "disabled"
    user.disabled_reason = "left"
    user.disabled_at = now

    # Revoke all SSO sessions
    db.query(SsoSession).filter(SsoSession.user_id == user.id, SsoSession.revoked_at.is_(None)).update({"revoked_at": now})

    # Revoke all refresh tokens
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).update({"revoked_at": now})

    db.commit()
    log_audit(db, action="user_marked_left", actor_id=admin.id, target_id=user.id, detail={"user_email": user.email})
    return {"status": "ok", "message": f"User {user.email} marked as left. All active sessions and tokens revoked."}

@router.post("/users/{user_id}/delete-approve")
def delete_approve(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.status != "disabled" or not user.disabled_at:
        raise HTTPException(status_code=400, detail={"error": "not_eligible", "message": "Account must be disabled"})
    
    days_disabled = (datetime.utcnow() - user.disabled_at).days
    if days_disabled < 30:
        raise HTTPException(status_code=400, detail={"error": "waiting_period_active", "message": f"Must wait 30 days after account was disabled. Current: {days_disabled} days."})

    user.status = "deleted"
    db.commit()
    log_audit(db, action="delete_approved", actor_id=admin.id, target_id=user.id)
    return {"status": "ok", "message": f"Account {user.email} permanently marked as deleted"}
```

## 5. Code explanation
- `mark_user_left`: Atomic multi-table revocation ensures there is no window where a revoked user can continue accessing connected products.
- `delete_approve`: Enforces the 30-day waiting period strictly on the server (`days_disabled < 30`), protecting against accidental or malicious immediate data loss.
- `require_admin_user`: Dependency enforces authentication and role verification before any administrative action executes.

## 6. How to run and test it
```bash
pytest backend/tests/test_admin_and_cleanup.py -v
```
**Checklist items satisfied:**
- [x] Mark as left: both apps show Access denied immediately; refresh token fails.
- [x] Delete is refused before 30 days or without approval.
- [x] Admin can register products and invite new members.

## 7. Limits and future work
Current implementation supports single-organization administration. Multi-tenant administrative scoping is future work.
