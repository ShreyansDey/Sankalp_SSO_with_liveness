# 08 — Universal SSO Integration API & First-Time Superuser Bootstrap

## Plain-English Summary

Before this update, setting up Sankalp SSO for a new organization required manually editing seed scripts, and connecting outside apps required direct database edits. Module 08 solves both:

1. **First-Time Superuser Creation Primary Key:** When setting up a fresh Sankalp SSO instance, the system owner chooses their own secret **Primary Key** (plus an optional setup username and password) at API key generation time using `scripts/generate_key.py`, the `/setup` web wizard, or `/api/v1/setup/configure-primary-key`. Without that Primary Key, nobody can create the first Super Admin account. Once the first Super Admin is created, bootstrap permanently locks itself.
2. **Universal Integration API (`/api/v1/...`):** External apps, ERPs, or SaaS tools can discover endpoints automatically (`/.well-known/openid-configuration`), create scoped API keys (`sk_live_...`), register OAuth2/PKCE apps, rotate secrets, inspect active tokens in real time, and instantly revoke departed members via REST calls.
3. **Downloadable Immutable Reports (`/api/v1/reports`):** Verified system audit and stress-test reports can be inspected and downloaded with SHA-256 checksums.

---

## Key Backend & Frontend Files

- [backend/app/routes/setup.py](file:///backend/app/routes/setup.py) — `/api/v1/setup/status`, `/api/v1/setup/configure-primary-key`, `/api/v1/setup/bootstrap-superuser`.
- [backend/app/routes/integrations.py](file:///backend/app/routes/integrations.py) — `/api/v1/keys`, `/api/v1/integrations/discovery`, `/api/v1/integrations/apps`, `/api/v1/integrations/apps/{app_id}/rotate-secret`, `/api/v1/integrations/users/{user_id}/revoke`, `/api/v1/integrations/audit`.
- [backend/app/routes/sso.py](file:///backend/app/routes/sso.py) — Added `/.well-known/openid-configuration`, RFC 7636 PKCE (`S256`), `/token/introspect`, `/token/revoke`.
- [backend/app/routes/reports.py](file:///backend/app/routes/reports.py) — Lists and streams SHA-256 verified reports from `docs/reports/`.
- [scripts/generate_key.py](file:///scripts/generate_key.py) — Cross-OS CLI key & primary key generator.
- [frontend/src/pages/Setup.jsx](file:///frontend/src/pages/Setup.jsx) & [frontend/src/components/admin/AdminIntegrationsTab.jsx](file:///frontend/src/components/admin/AdminIntegrationsTab.jsx) — UI setup wizard and admin API/App console.

---

## Walkthrough of Superuser Bootstrap & API Key Flow

1. Run `python scripts/generate_key.py` (or open `/setup` in the browser).
2. Enter your chosen **First-Time Superuser Creation Primary Key** (minimum 12 characters, Argon2-hashed into `system_bootstrap.primary_key_hash`) and optional bootstrap username/password.
3. Receive your one-time `sk_live_...` API key (only its SHA-256 digest is stored in `api_keys.key_hash`).
4. On first login/setup, submit the Primary Key (+ bootstrap credentials if configured) along with the Super Admin's name, email, and password to `POST /api/v1/setup/bootstrap-superuser`.
5. `SystemBootstrap.setup_completed` atomically flips to `True`, creating the Super Admin and returning a short-lived `login_ticket` to complete liveness check. Any second call fails with `HTTP 409 setup_already_completed`.

---

## Verification & Known Limits

- Covered by `backend/tests/test_universal_api_and_security.py` and `backend/tests/test_stress_and_connectors.py` (including 10-thread bootstrap race verification).
- Single-instance rate limits are in memory; distributed multi-node deployments require Redis for cluster-wide throttling.
