# 00 — Module Index & Technical Implementation Catalog

Welcome to the implementation catalog for **Sankalp SSO**. Every core capability in the system is isolated into a dedicated, self-contained module documented in accordance with `_module-template.md`.

---

## 📑 1. Master Module Registry

| Module # | Module Name | Primary Code Files | Status | Owner | Test Coverage |
|---|---|---|---|---|---|
| [**01**](file:///docs/modules/01-auth-core.md) | **Auth Core** (Signup, Login, Sessions, Argon2, Password Reset) | `backend/app/routes/auth.py`<br/>`backend/app/security.py`<br/>`backend/app/services/email_service.py` | **Done** | Shaan | `backend/tests/test_auth.py` |
| [**02**](file:///docs/modules/02-sso-flow.md) | **SSO Flow** (Authorize, Tokens, 60s Codes, Refresh, 1-Click SSO) | `backend/app/routes/sso.py`<br/>`backend/app/deps.py` | **Done** | Shaan | `backend/tests/test_sso.py` |
| [**03**](file:///docs/modules/03-liveness.md) | **Liveness Check** (MediaPipe Face Mesh, 3D Depth, Anti-Jitter Blink) | `frontend/src/pages/Liveness.jsx`<br/>`backend/app/routes/liveness.py` | **Done** | Arka | `frontend/src/pages/Liveness.jsx` |
| [**04**](file:///docs/modules/04-admin-dashboard.md) | **Admin Dashboard** (Member Management, Instant Mark as Left, 48h Renewals Desk) | `frontend/src/pages/Admin.jsx`<br/>`frontend/src/pages/Renew.jsx`<br/>`backend/app/routes/admin.py` | **Done** | Arka | `backend/tests/test_admin_and_cleanup.py`<br/>`backend/tests/test_renewal_and_48h_purge.py` |
| [**05**](file:///docs/modules/05-cleanup-job.md) | **Cleanup Job** (APScheduler Janitor, Term Expiry, 48h Hard Purge) | `backend/app/jobs/cleanup.py` | **Done** | Shaan | `backend/tests/test_admin_and_cleanup.py`<br/>`backend/tests/test_renewal_and_48h_purge.py` |
| [**06**](file:///docs/modules/06-audit-log.md) | **Audit Log** (Append-Only Trail, 20 Fixed Actions, PII Scrubber) | `backend/app/audit.py` | **Done** | Shaan | `backend/tests/test_admin_and_cleanup.py` |
| [**07**](file:///docs/modules/07-demo-apps.md) | **Demo Apps** (5 Connected Campus Clubs: Ports 5174–5178) | `demo-apps/serve_demo_apps.py`<br/>`demo-apps/app-[a-e]/index.html` | **Done** | Shaan & Arka | End-to-End Browser Tests |
| [**08**](file:///docs/modules/08-ekyc-face-verification.md) | **e-KYC & Biometrics** (YuNet + SFace 128D Vectors, Cosine Match $\ge 0.40$) | `backend/app/services/face_engine.py`<br/>`frontend/src/pages/Register.jsx` | **Done** | Arka & Shaan | `backend/tests/test_ekyc_and_biometrics.py`<br/>`backend/test_full_system.py` |

---

## 🗺️ 2. Architectural Module Interdependencies

The diagram below illustrates how each module interfaces with the others across client, API, and persistence layers:

```mermaid
flowchart TD
    M08["08: e-KYC Onboarding & Biometrics<br/>(YuNet + SFace 128D Vector Extraction)"]
    M01["01: Auth Core<br/>(Credentials, Sessions, Argon2, SMTP Reset)"]
    M03["03: Liveness Check<br/>(MediaPipe Face Mesh + 3D Depth)"]
    M02["02: SSO Flow<br/>(OAuth 2.0 /authorize, /token, JWTs)"]
    M07["07: Demo Apps<br/>(5 Connected Campus Clubs :5174-:5178)"]
    M04["04: Admin Dashboard<br/>(e-KYC Review, Mark as Left Revoke)"]
    M05["05: Cleanup Job<br/>(APScheduler Lifecycle Janitor)"]
    M06["06: Audit Log<br/>(Tamper-Resistant Security Trail)"]

    M08 -->|New Applicant Enrolls| M01
    M01 -->|Mandates Presence Check| M03
    M03 -->|1:1 SFace Biometric Match| M08
    M03 -->|Issues SSO Session Cookie| M02
    M02 -->|Grants OAuth Tokens| M07
    M04 -->|Approves Applications| M08
    M04 -->|Instant Mark as Left Revocation| M02
    M05 -->|Automated Expired Account Revocation| M02
    
    M01 -.->|Emits Security Events| M06
    M02 -.->|Emits Token Events| M06
    M03 -.->|Emits Liveness Events| M06
    M04 -.->|Emits Admin Events| M06
    M05 -.->|Emits Cleanup Events| M06
    M08 -.->|Emits Verification Events| M06
```

---

## 🎯 3. Definition of Done (Module Quality Standard)

Under project rules (`AGENTS.md`), a module is classified as **Done** only when:
1. The source code compiles, executes, and passes all relevant unit tests.
2. All test cases specified in `docs/specs/test-checklist.md` pass without regression.
3. A dedicated markdown file exists in `docs/modules/` containing:
   - Layman explanation of purpose and approach.
   - Detailed visual workflow / pipeline diagrams.
   - Complete, verbatim code listings for primary files.
   - Line-by-line / block-by-block functional breakdown.
   - Step-by-step instructions for running and verifying the module.
   - Honest architectural boundaries and future roadmap items.
4. The corresponding milestones in `docs/specs/todos.md` are checked.
