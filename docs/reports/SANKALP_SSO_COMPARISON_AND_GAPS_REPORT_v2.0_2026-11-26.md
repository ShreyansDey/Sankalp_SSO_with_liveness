# Sankalp SSO — Baseline Comparison, Remaining Gaps & Future Enhancements Report (v2.0)

**Generated:** 2026-11-26  
**Baseline Reference:** Commit `bd4fa97` (branch `arka`) prior to remediation  
**Current Revision:** Post-Remediation Hardened Modular Build (`v2.0.0`)

---

## 1. Executive Comparison: Pre-Audit Baseline vs. Post-Remediation v2.0

*Note: No prior audit report existed in git history; comparisons below contrast the audited baseline snapshot (`bd4fa97`) against the verified post-remediation build (`v2.0.0`).*

| Dimension | Pre-Audit Baseline (`bd4fa97`) | Post-Remediation (`v2.0.0`) | Impact |
| :--- | :--- | :--- | :--- |
| **Liveness Endpoint Auth** | `POST /liveness/challenge` accepted bare `user_id` without credential proof (passwordless takeover risk). | Strictly requires signed short-lived `login_ticket` or active `sso_session` (`401` otherwise). | Critical Auth Bypass Closed |
| **Biometric Engine Fallback** | Failed **OPEN** (`face_matched = True`) if OpenCV YuNet/SFace failed to load. | Fails **CLOSED** (`HTTP 503 biometric_engine_unavailable`); returns `401` on `face_mismatch`. | Critical Spoof Risk Closed |
| **CORS Policy** | Wildcard `allow_origin_regex=r"https?://.*"` with `allow_credentials=True`. | Explicit allowlist (`FRONTEND_ORIGIN`, `APP_*_ORIGIN`, `CORS_ORIGINS`) + narrow tunnel regex when enabled. | High CSRF / Credential Leak Closed |
| **OAuth2 Redirect Validation** | Port-only equality & broad `.*\.ngrok.*` regex allowed open redirects. | Exact match against registered `Product.redirect_uri`; blocks foreign domains/schemes. | High Token Theft Risk Closed |
| **Public Signup / e-KYC Gate** | Uninvited `/auth/signup` activated accounts immediately; `/register` ignored face detection failures & had no binary MIME/size caps. | `/auth/signup` requires invite unless `ALLOW_OPEN_SIGNUP=true`; `/register` enforces magic bytes, 5MB/10MB caps, and mandatory face extraction. | High Account Spam & Polyglot Upload Risk Closed |
| **Disabled User Session Enforcement** | `/auth/me` returned active profile even when `user.status != "active"`. | Both `/auth/me` and `/me` use `get_current_user_from_session` -> immediate `403`. | Revocation Gap Closed |
| **Admin 2FA OTP Vault** | In-memory `_DISABLE_LOCK_OTP_VAULT` + plaintext OTP printed to stdout; unlimited brute force. | Persisted in DB `admin_otp_tokens` (hashed, 5-attempt lockout), zero stdout secrets. | Multi-Worker & Brute-Force Fixed |
| **Single-Use Token Races** | Non-atomic check-then-set on `AuthCode`, `Invite`, `PasswordResetToken`, `LivenessChallenge`. | Atomic SQL `UPDATE ... WHERE id=... AND used_at IS NULL` + `constant_time_compare`. | Concurrency Race Eliminated |
| **Demo Client & Email XSS** | Unescaped `innerHTML` in 5 demo apps + missing `state` check + unescaped HTML email params. | Shared `demo-apps/shared/sso-client.js` with `escapeHtml()` & `verifyOAuthState()`; `html.escape()` in email templates; fixed `/sso/authorize` 404 & `/signout`. | Stored XSS & CSRF Closed |
| **SQLite Concurrency** | Default rollback journal without `busy_timeout` or `foreign_keys=ON`. | `PRAGMA journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`, `ThreadingHTTPServer` for demo apps. | Lock Contention Eliminated |
| **Universal Integration & Bootstrap** | No external integration API, no API keys, no user-defined Superuser Primary Key bootstrap. | Added `/api/v1/setup/*`, `/api/v1/keys`, `/api/v1/integrations/*`, PKCE `S256`, RFC 7662 introspection/revocation, OIDC discovery, CLI generator. | Full External SSO Readiness |
| **Codebase Modularity** | `admin.py` (1,153 LOC), `email_service.py` (1,123 LOC), `auth.py` (897 LOC). | `admin.py` (425) + 2 submodules; `email_service.py` (218) + 2 template modules; `auth.py` (157) + 2 submodules + `storage_service.py` (113). | Cleaner Separation of Concerns |
| **Verified Test Coverage** | 24 baseline tests passed. | **30 / 30 tests passed** (incl. 150-req WAL throughput & 4 race-condition suites). | Verified Under Worst-Case Load |

---

## 2. File-Size Modularity Delta

| File | Before (LOC) | After (LOC) | Extracted / Companion Modules |
| :--- | :---: | :---: | :--- |
| `backend/app/routes/admin.py` | 1,153 | **425** | `admin_applications.py` (239), `admin_facelock.py` (353) |
| `backend/app/services/email_service.py` | 1,123 | **218** | `email_auth_templates.py` (328), `email_lifecycle_templates.py` (304) |
| `backend/app/routes/auth.py` | 897 | **157** | `auth_onboarding.py` (325), `auth_recovery.py` (204), `storage_service.py` (113) |
| New Universal & Security Backend | — | 870 total | `setup.py` (239), `integrations.py` (332), `reports.py` (64), `middleware/security.py` (86), `deps.py` (+85), `security.py` (+81) |
| New Frontend & Shared Helpers | — | 708 total | `Setup.jsx` (279), `AdminIntegrationsTab.jsx` (192), `useCamera.js` (63), `countries.js` (51), `livenessMath.js` (41), `ConsentCharter.jsx` (35), `sso-client.js` (26) |

---

## 3. Remaining Honest Limits & Open Gaps

To remain transparent and production-honest (no overclaiming per `docs/specs/security.md`):

1. **Client-Side Liveness Enforcement Boundary:** Active physical liveness (EAR blink & head yaw via MediaPipe Face Mesh) executes in the browser. A sophisticated attacker bypassing the browser UI with raw HTTP calls plus a genuine stolen video frame cannot defeat enrolled 128D SFace matching (`require_face_match=True`), **except** for members with `require_face_match=False` (legacy password-only invites) or real-time 3D deepfake puppetry / virtual webcam injection.
2. **Large Monolithic Frontend Pages Still Pending Full JSX Migration:** Shared hooks and utilities ([useCamera.js](file:///frontend/src/hooks/useCamera.js), [countries.js](file:///frontend/src/constants/countries.js), [livenessMath.js](file:///frontend/src/utils/livenessMath.js), [ConsentCharter.jsx](file:///frontend/src/components/auth/ConsentCharter.jsx)) were created and verified in the Vite build, **however** existing large JSX files ([Register.jsx](file:///frontend/src/pages/Register.jsx) 1,804 LOC, [Liveness.jsx](file:///frontend/src/pages/Liveness.jsx) 1,367 LOC, [Admin.jsx](file:///frontend/src/pages/Admin.jsx) 1,128 LOC, [Signup.jsx](file:///frontend/src/pages/Signup.jsx) 820 LOC) still contain inline form/camera steps and modals pending step-by-step JSX refactor paired with browser E2E automation.
3. **In-Memory Rate Limiter Scope:** [middleware/security.py](file:///backend/app/middleware/security.py) protects single-process deployments thread-safely, whereas horizontally scaled multi-container clusters require a shared Redis backend for cluster-wide rate limits (note: `/liveness/challenge`'s 5/10m limit IS persisted in SQL and already works across multiple workers).
4. **JWT Asymmetric Signing & Short-Lived Access Revocation:** Access JWTs use symmetric `HS256` (`JWT_SECRET`) with a 10-minute lifetime and OIDC `/token/introspect` live status check. Integrating apps that verify JWTs purely offline without calling `/token/introspect` or waiting for `/token/refresh` retain access until the 10-minute `exp` window elapses.
5. **Email Templates & Admin File Blobs:** `GET /admin/applications` now caps page size at `50` and supports `include_blobs=false`, but still defaults to `include_blobs=true` for UI backward compatibility until frontend switches exclusively to lazy `<img src="/admin/files/...">` streaming.
6. **Runtime Environments Tested vs. Statically Checked:** Automated test & stress suites ran directly on **Windows 11 + Python 3.11.9 + SQLite WAL + Vite 5.4.21**. Linux/Docker `nginx.conf` proxy rules and PostgreSQL `ALTER TABLE` startup paths were inspected and aligned cleanly, but require a live container integration run on target Linux/PostgreSQL hosts before cutover.

---

## 4. Recommended Future Enhancements

1. **Asymmetric RS256/EdDSA + Public JWKS Endpoint (`/.well-known/jwks.json`):** Upgrade JWT signing from `HS256` to rotating asymmetric keys so external SaaS microservices verify tokens locally via public keys without sharing symmetric secrets.
2. **Redis-Backed Distributed Rate Limiting & Revoked JTI Blocklist:** Enforce zero-second access-token revocation even for stateless microservices and shared rate limiting across Uvicorn workers.
3. **Server-Side Challenge Video Frame Sequence Verification / Depth-or-Texture PAD:** Evaluate multi-frame optical flow + passive reflection/moire texture checks on `/liveness/result` to mitigate high-resolution replay attacks and virtual cameras.
4. **Complete JSX Extraction on Legacy Frontend Pages + Playwright Browser E2E:** Wire `Register.jsx`, `Liveness.jsx`, `Signup.jsx`, and `Admin.jsx` modals into dedicated subcomponents and cover full WebRTC + OAuth redirect flows with automated Playwright tests in CI.
5. **Live Webhook Event Dispatch for Connectors:** Push signed HMAC-SHA256 webhooks (`user.revoked`, `user.purged`, `user.term_ending`) to registered external apps alongside pull-based `/token/introspect` & `/api/v1/integrations/audit`.
