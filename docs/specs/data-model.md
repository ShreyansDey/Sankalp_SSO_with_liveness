# data-model.md (names are final; change docs first, then code)

| Table | Fields |
|---|---|
| `users` | id, email (unique), name, password_hash, role (`admin`/`member`), status (`active`/`disabled`/`deleted`), term_end (date, nullable), last_active_at, liveness_passed_at, disabled_at, disabled_reason (`left`/`term_end`/`inactive`/`admin`), created_at |
| `invites` | id, email, role, term_end, token_hash, expires_at, used_at, created_by |
| `products` | id, name, client_id (unique), client_secret_hash, redirect_uri |
| `sso_sessions` | id, user_id, created_at, expires_at, revoked_at, ip, user_agent |
| `auth_codes` | id, user_id, product_id, code_hash, expires_at (60 s), used_at |
| `refresh_tokens` | id, user_id, product_id, token_hash, expires_at, revoked_at |
| `liveness_challenges` | id, user_id, type (`blink`/`turn_left`/`turn_right`), code_hash, expires_at (30 s), used_at, result (`pass`/`fail`/null) |
| `audit_log` | id, at, actor_id, action, target_id, detail (json) |

## Rules
- Store only hashes of tokens, codes and secrets.
- Never store face images, video or landmarks.
- `disabled_at` + 30 days is the earliest time a delete can be approved.
- Inactivity rule: no activity for 60 days → disabled (value lives in config).

## Audit actions (fixed list)
`invite_created`, `signup`, `login_ok`, `login_fail`, `liveness_pass`, `liveness_fail`, `token_issued`, `access_denied`, `user_marked_left`, `user_disabled_auto`, `user_enabled`, `delete_requested`, `delete_approved`, `product_registered`.
