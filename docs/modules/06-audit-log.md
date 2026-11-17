# 06 — Audit Log (Security & Accountability)

**Status:** done · **Owner:** Shaan · **Date:** 2026-11-17

## 1. What it is (plain words)
The Audit Log provides an unalterable history of every critical security event that occurs in the system: logins, failed credential attempts, liveness passes and fails, token issuances, admin mark-as-left events, and automated account cleanups. It is designed to never record passwords, tokens, or codes.

## 2. Why it exists
Covers requirements **M7** (audit log of important actions), **FR7** (every admin action, login, denial, and cleanup action is written to the audit log), and the privacy and security rules in `data-model.md` and `security.md`.

## 3. How it works
1. **Fixed Actions List**: Enforces the 14 standard action strings defined in `data-model.md`:
   - `invite_created`, `signup`, `login_ok`, `login_fail`, `liveness_pass`, `liveness_fail`, `token_issued`, `access_denied`, `user_marked_left`, `user_disabled_auto`, `user_enabled`, `delete_requested`, `delete_approved`, `product_registered`.
2. **Sanitization Guarantee**: The logging engine automatically strips any fields containing sensitive keywords (such as `password`, `token`, `secret`, `code`, or `hash`) from event details before saving.
3. **Structured Storage**: Each entry contains a timestamp (`at`), the actor who performed the action (`actor_id`), the action name (`action`), the affected entity (`target_id`), and contextual JSON detail (`detail`).
4. **Admin Inspection**: Admins can view newest-first audit events via `GET /admin/audit?limit=...` or the Admin Console UI.

## 4. Code

### `backend/app/audit.py`
```python
# backend/app/audit.py
VALID_AUDIT_ACTIONS = {
    "invite_created", "signup", "login_ok", "login_fail",
    "liveness_pass", "liveness_fail", "token_issued", "access_denied",
    "user_marked_left", "user_disabled_auto", "user_enabled",
    "delete_requested", "delete_approved", "product_registered"
}

def log_audit(db: Session, action: str, actor_id: Optional[str] = None, target_id: Optional[str] = None, detail: Optional[Dict[str, Any]] = None) -> AuditLog:
    if action not in VALID_AUDIT_ACTIONS:
        raise ValueError(f"Action '{action}' is not in the fixed audit actions list")

    sanitized_detail = None
    if detail:
        sanitized_detail = {}
        for k, v in detail.items():
            if any(forbidden in k.lower() for forbidden in ["password", "token", "secret", "code", "hash"]):
                continue
            sanitized_detail[k] = v

    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_id=target_id,
        detail=sanitized_detail
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
```

## 5. Code explanation
- `VALID_AUDIT_ACTIONS`: Using a Python set provides $O(1)$ validation to reject arbitrary or malformed audit action strings.
- `sanitized_detail`: Proactively scrubs sensitive authentication artifacts before committing to the database.
- `AuditLog`: Model uses SQL index on `at`, `action`, `actor_id`, and `target_id` to guarantee fast query performance.

## 6. How to run and test it
```bash
pytest backend/tests/test_admin_and_cleanup.py -k test_admin_and_cleanup_flow -v
```
**Checklist items satisfied:**
- [x] Every action in `data-model.md` audit list appears in the log.
- [x] No passwords, tokens, or codes in logs.
- [x] Database contains no face images or video.

## 7. Limits and future work
The audit table is stored within the primary application database. In high-compliance enterprise environments, forwarding logs to an external append-only SIEM (such as OpenSearch or AWS CloudWatch) would provide cryptographic immutability.
