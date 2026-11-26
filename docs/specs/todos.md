# todos.md — Milestone & Deliverable Checklist

**Project:** Real Person, Real Access · **Product:** Sankalp SSO  
**Team:** Sankalp (Shreyans Dey, Arka Paul) · **Event:** Hack N Pitch 2026, Jadavpur University E-Cell  

---

## 🏁 Phase 0: Setup & Groundwork
- [x] Review competition rules: local self-hosted deployment, laptop hardware, offline operation.
- [x] Establish documentation hub and architectural specifications in `docs/specs/`.
- [x] Setup Python 3.11 virtual environment and install backend core dependencies (`fastapi`, `uvicorn`, `sqlalchemy`, `pyjwt`, `argon2-cffi`, `apscheduler`).
- [x] Scaffold React 19 + Vite 6 frontend application.
- [x] Download MediaPipe Face Mesh browser models and OpenCV ONNX models (`face_detection_yunet_2023mar.onnx`, `face_recognition_sface_2021dec.onnx`) for offline use.
- [x] Configure SQLite local persistence database and verify automated schema generation.

---

## 🔑 Phase 1: Core Authentication, Single Sign-On & Revocation
- [x] Implement database models in `backend/app/models.py` (`User`, `Invite`, `Product`, `SsoSession`, `AuthCode`, `RefreshToken`).
- [x] Build user registration and invite token verification (`POST /auth/signup`).
- [x] Implement credentials authentication with Argon2id password hashing (`POST /auth/login`).
- [x] Create OAuth 2.0 Authorization Code flow:
  - [x] Endpoint `GET /authorize` with exact `redirect_uri` validation.
  - [x] One-time 60-second authorization code generation and spending.
  - [x] Endpoint `POST /token` returning 10-minute JWT `access_token` and revocable `refresh_token`.
  - [x] Endpoint `POST /token/refresh` with active account verification.
  - [x] Endpoint `GET /userinfo` for identity resolution.
- [x] Develop Self-Service Password Recovery workflow:
  - [x] Single-use 15-minute token generation via `POST /auth/forgot-password`.
  - [x] Asynchronous institutional SMTP TLS email dispatcher (`email_service.py`).
  - [x] Token verification endpoint `POST /auth/verify-reset-token`.
  - [x] Password update with Argon2 hashing and atomic session revocation (`POST /auth/reset-password`).
- [x] Build instant revocation endpoint `POST /admin/users/{id}/mark-left` (< 0.2s latency).
- [x] Develop 5 connected campus club applications (ports 5174–5178) with multi-port HTTP runner.
- [x] **Checkpoint 1 Verification**: Complete. Documented in `01-auth-core.md`, `02-sso-flow.md`, and `07-demo-apps.md`.

---

## 👁️ Phase 2: Active Physical Liveness & Anti-Spoofing
- [x] Implement challenge generation endpoint `POST /liveness/challenge` with rate limiting (max 5 per 10 minutes).
- [x] Implement unpredictable server-directed challenges (`turn_left` vs `turn_right`) with 30-second codes.
- [x] Embed MediaPipe Face Mesh in frontend (`frontend/src/pages/Liveness.jsx`) running 468 3D landmarks in browser RAM.
- [x] Develop multi-stage Presentation Attack Detection (PAD):
  - [x] Multiple face presence detection (blocks more than 1 person).
  - [x] Bounding box scale limits (rejects small card cutouts or over-magnified screens).
  - [x] 3D Z-depth variance analysis ($\sigma_Z$) rejecting flat 2D color photographs.
  - [x] Head yaw asymmetry angle calibration.
  - [x] Center-gaze personalized open-eye Eye Aspect Ratio (EAR) dynamic calibration.
  - [x] Multi-frame temporal blink filter with 220ms debouncing (rejects micro-flutters and squints).
- [x] Implement high-speed frame capture at verified eye reopening.
- [x] **Checkpoint 2 Verification**: Complete. Documented in `03-liveness.md`.

---

## ⚙️ Phase 3: Lifecycle Automation & Security Audit
- [x] Integrate APScheduler daemon inside FastAPI startup lifecycle.
- [x] Implement daily automated janitor logic (`backend/app/jobs/cleanup.py`):
  - [x] Disable accounts exceeding `term_end` calendar date.
  - [x] Disable accounts inactive for $> 60$ days.
  - [x] Atomic multi-table revocation of active SSO sessions and refresh tokens.
  - [x] 48-Hour Vault Recovery Window: disabled accounts held in vault for 48 hours only.
  - [x] Automated 48-Hour Recovery notice emails with hyperlinked `/renew` CTA and red disclaimer.
  - [x] Self-service renewal appeals portal (`/renew`) and Admin Review Desk with countdown timer.
  - [x] Hard Purge at 48 hours without approved renewal: permanently erases user record from DB and deletes uploaded documents/biometrics from disk (zero vault retention).
  - [x] Dispatches complete Personal Data Takeout Export Email with re-registration from scratch notice at exact moment of hard purge.
- [x] Create on-demand manual janitor trigger `POST /admin/cleanup/run` for judge presentations.
- [x] Enforce 30-day account deletion guardrail (`POST /admin/users/{id}/delete-approve`).
- [x] Build append-only `audit_log` with automatic PII/credential sanitization scrubbing (`backend/app/audit.py`).
- [x] Develop Admin Console UI with real-time audit ledger inspection.
- [x] **Checkpoint 3 Verification**: Complete. Documented in `04-admin-dashboard.md`, `05-cleanup-job.md`, and `06-audit-log.md`.

---

## 🛡️ Phase 4: Institutional e-KYC & Biometric Face Verification
- [x] Integrate OpenCV YuNet face detection and SFace deep facial recognition models.
- [x] Implement unit-normalized 128D mathematical embedding extraction in `backend/app/services/face_engine.py`.
- [x] Build 1:1 Cosine Similarity matching engine with calibrated threshold of $0.40$.
- [x] Build e-KYC onboarding pipeline (`POST /auth/apply` and `POST /auth/register`):
  - [x] Capture live webcam portrait and student identification document.
  - [x] Extract 128D enrollment embedding and set status to `pending_approval`.
  - [x] Block unapproved applicants from logging in (`403 account_pending_approval`).
- [x] Build Admin Review Desk UI:
  - [x] Display pending applications with side-by-side photo and document inspection.
  - [x] Implement one-click approval (`POST /admin/applications/{id}/approve`) and rejection (`POST /admin/applications/{id}/reject`).
- [x] Integrate daily login biometric verification (`POST /liveness/result`):
  - [x] Live frame evaluated against approved enrollment embedding.
  - [x] Reject impostors with `401 face_mismatch` and record security audit event.
- [x] Implement Administrator Biometric Face Lock & Multi-Face Management (`admin_faces`, `require_face_match`, `AdminFaceLockTab.jsx`).
- [x] Implement Real-Time Security Alerts (Login Alerts, Password Changed Notices, and Automated SMTP Invites).
- [x] Enforce Universal Indian Standard Time (IST) formatting across frontend tables and backend security notifications.
- [x] **Checkpoint 4 Verification**: Complete. Documented in `08-ekyc-face-verification.md`.

---

## 📖 Phase 5: Documentation & Rehearsal
- [x] Update Master Documentation Hub `docs/README.md`.
- [x] Finalize all specification documents (`srs.md`, `architecture.md`, `data-model.md`, `api.md`, `security.md`, `build-plan.md`, `stack-and-setup.md`, `demo-script.md`, `test-checklist.md`).
- [x] Complete module implementation manuals `00-index.md` through `08-ekyc-face-verification.md` with full code listings, diagrams, and line-by-line breakdowns.
- [x] Complete `09-system-overview-and-pitch.md` (Overall System Analysis, Market Sizing, Corporate Sponsorship ROI, Judge Conviction Strategy, and Claude PPTX Generation Deck).
- [x] Seed demo database with Rahul and expired alumni test accounts (`python backend/seed.py`).
- [x] Rehearse 4-minute demo presentation script twice.


---

## 🔐 Phase 6: Security Hardening, Modular Refactoring, Universal SSO API & Stress Verification (v2.0)
- [x] Fix all audited security vulnerabilities (ticket-bound liveness, fail-closed biometrics `503`, HTTP `401` on `face_mismatch`, strict CORS & redirect URI allowlisting, binary upload magic-byte caps, XSS HTML escaping, atomic single-use claims, DB-backed OTP lockout).
- [x] Split oversized monoliths cleanly (`admin.py`, `auth.py`, `email_service.py`) and add SQLite WAL + `busy_timeout=5000` + `foreign_keys=ON`.
- [x] Implement Universal External SSO API (`/api/v1/keys`, `/api/v1/integrations/*`, `/.well-known/openid-configuration`, PKCE `S256`, RFC 7662 `/token/introspect`, `/token/revoke`) & First-Time Superuser Creation Primary Key Bootstrap (`/api/v1/setup/*`, `scripts/generate_key.py`, `/setup` UI).
- [x] Add comprehensive security regression, Dummy SaaS/SQLite connector lifecycle, and multi-threaded WAL race/latency stress tests (**30/30 passed**).
- [x] Generate immutable SHA-256 verified reports (`docs/reports/`) downloadable via `/api/v1/reports` and documented in `docs/modules/10-universal-api-and-bootstrap.md`.
