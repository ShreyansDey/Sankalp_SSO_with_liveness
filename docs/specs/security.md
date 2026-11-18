# security.md

## Threats and answers
| Threat | Answer |
|---|---|
| Stolen or guessed password | Camera check at signup and when no SSO session exists; rate limit and lockout after repeated failures |
| Printed photo shown to camera | Random challenge (blink or head turn) that a still photo cannot do |
| Replayed recorded video | One-time code valid 30 seconds, tied to one challenge id and one user |
| Left-over account of a former member | Mark as left, term end, inactivity cleanup; all revoke sessions and tokens at once |
| Stolen access token | Lives only 10 minutes |
| Stolen refresh token | Stored hashed, revocable, checked against user status on every refresh |
| Redirect to a fake site | Exact match of registered `redirect_uri`; `state` value checked |
| Leaked database | Only hashes of passwords, tokens, codes and secrets; no face data exists |
| Admin misuse | Every admin action is in the audit log |

## Rules
- Passwords: argon2 or bcrypt. Minimum length 8.
- Session cookie: HttpOnly, SameSite=Lax, Secure when on https.
- JWT: signed (HS256 with a long secret from the environment, or RS256), short expiry, includes user id and a token id.
- CORS: allow only our own front-end and demo app addresses.
- Secrets: environment variables only. `.env` is never committed.
- Logs: never write passwords, tokens or codes.

## Privacy
Face video stays in the browser. Only pass or fail with a time is stored. No landmarks, no images.

## Honest limits (say these out loud if asked)
1. The check stops photos and replays. Real-time deepfakes are future work.
2. Liveness proves a live person, not which person. Face matching to a saved photo is future work.
3. The pass/fail result is sent by the browser, so a determined attacker who controls the browser could fake it. We reduce this with one-time codes, short expiry, rate limits and the audit log. A stronger version would verify on the server.
4. Poor light or weak cameras can fail real people. Retries and an admin-approved fallback exist.
