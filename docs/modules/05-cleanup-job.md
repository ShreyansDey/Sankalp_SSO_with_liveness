# 05 — Cleanup Job (Automated Lifecycle Expiry)

**Status:** done · **Owner:** Shaan · **Date:** 2026-11-17

## 1. What it is (plain words)
The Cleanup Job is a background maintenance task that automatically revokes accounts that have passed their term end date (such as graduating students) or have been inactive for more than 60 days. It solves the core problem: orphaned accounts that stay active long after members have moved on.

## 2. Why it exists
Covers requirements **M6** (automatic cleanup: term end date and inactivity disable accounts) and **FR2** (disabling revokes SSO session and all refresh tokens immediately).

## 3. How it works
1. **Background Schedule**: Runs automatically every 24 hours via APScheduler in FastAPI's background thread pool.
2. **On-Demand Execution**: Can be triggered manually at any time by an administrator through `POST /admin/cleanup/run` (demonstrated in Step 5 of the demo script).
3. **Term End Rule**: Finds all active users whose `term_end` date is strictly earlier than `date.today()`.
4. **Inactivity Rule**: Finds all active users whose `last_active_at` timestamp is older than `INACTIVITY_DAYS` (default 60 days).
5. **Immediate Revocation**:
   - Sets `status = 'disabled'`.
   - Records `disabled_reason` (`'term_end'` or `'inactive'`).
   - Automatically revokes all active SSO sessions (`sso_sessions.revoked_at = now`).
   - Revokes all refresh tokens (`refresh_tokens.revoked_at = now`).
   - Writes `user_disabled_auto` to the audit log.

## 4. Code

### `backend/app/jobs/cleanup.py`
```python
# backend/app/jobs/cleanup.py
def run_cleanup_job(db: Session) -> Dict[str, Any]:
    now = datetime.utcnow()
    today = date.today()
    inactivity_threshold = now - timedelta(days=INACTIVITY_DAYS)
    disabled_users = []

    # 1. Term End Policy
    expired_term_users = db.query(User).filter(
        User.status == "active",
        User.term_end.is_not(None),
        User.term_end < today
    ).all()

    for user in expired_term_users:
        user.status = "disabled"
        user.disabled_reason = "term_end"
        user.disabled_at = now

        db.query(SsoSession).filter(SsoSession.user_id == user.id, SsoSession.revoked_at.is_(None)).update({"revoked_at": now})
        db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).update({"revoked_at": now})

        log_audit(db, action="user_disabled_auto", actor_id="system_cleanup_job", target_id=user.id, detail={"reason": "term_end", "term_end": str(user.term_end)})
        disabled_users.append({"id": user.id, "email": user.email, "reason": "term_end"})

    # 2. Inactivity Policy
    inactive_users = db.query(User).filter(
        User.status == "active",
        User.created_at < inactivity_threshold,
        (User.last_active_at < inactivity_threshold) | (User.last_active_at.is_(None))
    ).all()

    for user in inactive_users:
        user.status = "disabled"
        user.disabled_reason = "inactive"
        user.disabled_at = now

        db.query(SsoSession).filter(SsoSession.user_id == user.id, SsoSession.revoked_at.is_(None)).update({"revoked_at": now})
        db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).update({"revoked_at": now})

        log_audit(db, action="user_disabled_auto", actor_id="system_cleanup_job", target_id=user.id, detail={"reason": "inactive", "days_threshold": INACTIVITY_DAYS})
        disabled_users.append({"id": user.id, "email": user.email, "reason": "inactive"})

    db.commit()
    return {"status": "ok", "processed_at": now.isoformat(), "total_disabled": len(disabled_users), "disabled_users": disabled_users}
```

## 5. Code explanation
- `today = date.today()`: Compares calendar dates directly against `User.term_end` (SQL Date field) so that accounts expire at midnight on their term end date.
- `inactivity_threshold`: Dynamically calculated from `INACTIVITY_DAYS` loaded from the `.env` configuration file.
- `log_audit(action='user_disabled_auto')`: Guarantees full audit accountability whenever automated processes change account access rights.

## 6. How to run and test it
```bash
pytest backend/tests/test_admin_and_cleanup.py -k test_admin_and_cleanup_flow -v
```
**Checklist items satisfied:**
- [x] Term end in the past: cleanup disables the user.
- [x] Inactive over the limit: cleanup disables the user.
- [x] Automated action is recorded in audit log.

## 7. Limits and future work
Email notifications to warning members before their term ends (e.g. 7 days prior) can be integrated as an optional notification hook.
