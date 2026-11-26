# Real Person, Real Access
## Sankalp SSO & Digital Identity Platform

A lightweight, self-hosted Single Sign-On (SSO) and biometric access control platform designed for universities, research laboratories, and institutional clubs. Built by **Team Sankalp** (Shreyans Dey & Arka Paul) for **Hack N Pitch 2026** at Jadavpur University (Track: *Cybersecurity & Digital Identity*).

---

## Executive Summary

Traditional authentication systems in academic and institutional settings suffer from three major vulnerabilities:

1. **Credential Sharing & Account Replay**: Passwords and session cookies are easily shared between students or ex-members, providing unauthorized access to physical labs and internal software.
2. **Orphaned Access**: When a student graduates or leaves a club, their accounts often remain active across multiple independent departmental tools for months or years.
3. **Biometric Privacy Violation**: Conventional biometric solutions transmit and store raw facial imagery or video streams on central servers, creating severe compliance and privacy risks.

**Sankalp SSO** resolves these challenges through a unified identity platform:
- **Centralized SSO Protocol**: One login unlocks connected services via signed OAuth 2.0 / OpenID-style authorization codes and short-lived JWT tokens.
- **Client-Side Liveness Detection**: In-browser facial landmark analysis (MediaPipe Face Mesh) verifies physical presence using randomized interactive challenges (eye blinks and head turns). Only cryptographic verification tokens and boolean outcomes are transmitted; raw video never leaves the user's browser.
- **e-KYC & Administrator Biometric Lock**: Deep neural network facial embeddings (128-dimensional vectors) allow institutions to gate administrative command desks to authorized physical individuals.
- **Privileged Out-of-Band 2FA**: Downgrading security policies (such as disabling biometric face lock) strictly requires single-use 6-digit email OTP verification.
- **Automated Lifecycle & 48-Hour Purge**: Automated background scheduling cuts off inactive accounts, while an administrative "Mark as Left" action revokes access instantaneously across all connected clubs with a 48-hour recovery and hard-purge safety window.

---

## System Architecture

The following diagram illustrates the complete topology of Sankalp SSO, connecting the central authentication core, identity server, administrative desk, and institutional portals:

```
+---------------------------------------------------------------------------------------+
|                                      User Browser                                     |
|                                                                                       |
|   +------------------------------------+    +-------------------------------------+   |
|   |         Standard User Flow         |    |         Admin Security Flow         |   |
|   |  - Credentials entry               |    |  - Privileged credential check      |   |
|   |  - Client-side MediaPipe liveness  |    |  - Liveness + 128D Face Matching    |   |
|   |  - Ephemeral landmark processing   |    |  - Out-of-band 2FA OTP modal        |   |
|   +-----------------+------------------+    +------------------+------------------+   |
+---------------------|------------------------------------------|----------------------+
                      | (HTTPS / Encrypted Session)              |
                      v                                          v
+---------------------------------------------------------------------------------------+
|                               Central Gateway (Port 5180)                             |
|                                 React 18 + Vite Frontend                              |
|                                                                                       |
|   [ /login ]        [ /signup (e-KYC) ]     [ /liveness ]      [ /admin ]             |
|   Standard Login    ID upload & photo       Challenge UI       Command Desk           |
+------------------------------------------+--------------------------------------------+
                                           |
                                           | Internal API Requests
                                           v
+---------------------------------------------------------------------------------------+
|                              Auth Core Engine (Port 8001)                             |
|                                    FastAPI Service                                    |
|                                                                                       |
|   +-------------------------+  +--------------------------+  +--------------------+   |
|   |   Authentication & SSO  |  |   Biometrics & Liveness  |  |   Lifecycle Jobs   |   |
|   |   - Argon2id Password   |  |   - MediaPipe challenges |  |   - APScheduler    |   |
|   |   - Signed JWT Access   |  |   - YuNet / SFace ONNX   |  |   - Term expiry    |   |
|   |   - Auth Code Exchange  |  |   - 128D Cosine Matching |  |   - Inactive purge |   |
|   +-------------------------+  +--------------------------+  +--------------------+   |
|                                          |                                            |
|   +-------------------------+            |                   +--------------------+   |
|   |    Email & 2FA Engine   |            |                   |  Immutable Audit   |   |
|   |   - RFC 2387 Templates  |<-----------+                   |  - IST timestamps  |   |
|   |   - Out-of-band OTP     |                                |  - PII scrubber    |   |
|   +-------------------------+                                +--------------------+   |
+--------------------+-----------------------------------------------------+------------+
                     |                                                     |
                     v                                                     v
+----------------------------------------+              +-------------------------------+
|         PostgreSQL 15 / SQLite         |              |  Connected Campus Club Apps   |
|                                        |              |                               |
|   - users (roles, term_end, status)    |              |   App A: Photography (5174)   |
|   - admin_faces (128D JSON vectors)    |              |   App B: Robotics Lab (5175)  |
|   - sso_sessions & refresh_tokens      |              |   App C: AI & Coding   (5176) |
|   - renewal_requests & audit_logs      |              |   App D: Chess Club    (5177) |
|                                        |              |   App E: Athletics     (5178) |
+----------------------------------------+              +-------------------------------+
```

---

## Authentication & Liveness Protocol Flow

The sequence below outlines the step-by-step cryptographic handshake executed during member sign-in:

```
User Browser              App A (Client)             Auth Server (SSO)          Database
     |                          |                           |                      |
     |--- 1. Open Portal ------>|                           |                      |
     |    (No active token)     |                           |                      |
     |                          |--- 2. Redirect to SSO --->|                      |
     |                          |    (/authorize?client_id) |                      |
     |<-- 3. Render Login Screen ---------------------------|                      |
     |                                                      |                      |
     |--- 4. POST /auth/login (email + password) ---------->|                      |
     |                                                      |--- 5. Verify Hash -->|
     |                                                      |<-- OK (Needs Live) --|
     |<-- 6. Issue 30s Liveness Ticket (action: "blink") ---|                      |
     |                                                      |                      |
     |=== 7. In-Browser MediaPipe Face Mesh Evaluation ====|                      |
     |    (EAR threshold < 0.18 detected twice)             |                      |
     |                                                      |                      |
     |--- 8. POST /liveness/verify (ticket + proof) ------->|                      |
     |                                                      |--- 9. Validate ----->|
     |                                                      |<-- Success ----------|
     |<-- 10. Set HttpOnly sso_session Cookie + Auth Code --|                      |
     |                                                      |                      |
     |--- 11. Return to App A with Authorization Code ----->|                      |
     |                          |                           |                      |
     |                          |--- 12. POST /sso/token -->|                      |
     |                          |    (code + client_secret) |                      |
     |                          |<-- 13. JWT Access Token --|                      |
     |<-- 14. Dashboard Loaded -|    (Valid for 10 minutes) |                      |
     |                          |                           |                      |
     |--- 15. One-Click: User Opens App B ----------------->|                      |
     |    (Valid sso_session cookie present)                |                      |
     |<-- 16. Instant Redirect with new Auth Code ----------|                      |
     |    (No credentials or camera prompt required)        |                      |
```

---

## Technical Specifications & Features

### 1. Privacy-First Biometric Liveness (Tier 1)
- **Engine**: Google MediaPipe Face Mesh compiled to WebAssembly, executing entirely within the client's browser thread.
- **Challenge Verification**: Evaluates 468 3D facial landmarks in real time.
- **Blink Detection**: Uses Eye Aspect Ratio (EAR) calculated from landmark indices:
  $$\text{EAR} = \frac{\|p_2 - p_6\| + \|p_3 - p_5\|}{2 \|p_1 - p_4\|}$$
- **Head Turn Detection**: Computes horizontal yaw angle from the nose tip displacement relative to the lateral cheek boundaries.
- **Anti-Replay Mechanism**: Challenges are bound to single-use, cryptographically random tickets with a strict 30-second TTL.
- **Data Minimization**: Video frames are processed in memory and never buffered to disk or sent over the network. The backend receives only a boolean outcome verified against the active challenge ticket.

### 2. 128-Dimensional Facial Recognition & Admin Lock (Tier 2)
- **Embedding Pipeline**: Uses OpenCV's YuNet neural face detector paired with the SFace lightweight deep feature extractor.
- **Vector Representation**: Faces are encoded into normalized 128-dimensional floating-point vectors:
  $$\vec{v} \in \mathbb{R}^{128}, \quad \|\vec{v}\|_2 = 1$$
- **Similarity Metric**: Cosine similarity is computed between candidate and enrolled embeddings:
  $$\text{Similarity}(\vec{u}, \vec{v}) = \frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\| \|\vec{v}\|} = \sum_{i=1}^{128} u_i v_i$$
- **Enforcement Policy**: Administrator authentication enforces a dual checkpoint:
  1. Interactive liveness challenge (Tier 1) proves live human presence.
  2. Neural embedding comparison against authorized admin profiles (threshold $\ge 0.70$) ensures physical identity match.
- **Enforcement Gating**: The system prevents locking administrative access unless at least one valid administrator face profile is enrolled.

### 3. Privileged Out-of-Band 2-Step Verification (2FA)
- **Threat Mitigated**: Unauthorized downgrade of security policies by an adversary with access to an active admin workstation.
- **Protocol**: Disabling the Biometric Face Lock triggers an out-of-band security challenge:
  - Generates a cryptographically random 6-digit OTP via Python's `secrets` module.
  - Dispatches an RFC 2387 multipart HTML notification to the administrator's verified email.
  - Enforces a 5-minute single-use expiration stored in an encrypted in-memory vault.
  - Requires OTP validation before updating the policy in PostgreSQL. Direct API calls attempting to toggle `enforce: false` without OTP verification are rejected with `HTTP 400 2fa_required`.

### 4. e-KYC Onboarding & DPDP Act Compliance
- **Application Workflow**: Prospective members register via `/signup`, supplying organizational credentials, a photo of their institutional ID, and a live face capture.
- **Admin Approval Desk**: Administrators review applicant credentials, inspect document attachments, and evaluate photo clarity.
- **Privacy Enforcement**: Aligned with the principles of the Digital Personal Data Protection (DPDP) Act:
  - Upon approval, the 128-dimensional mathematical embedding is extracted and saved to the user record.
  - The physical ID document file and raw face photo are immediately and permanently unlinked and deleted from storage.

### 5. Automated Lifecycle Management & 48-Hour Safety Window
- **Instant Revocation ("Mark as Left")**: Clicking "Mark as Left" in the admin desk immediately terminates all active SSO sessions, invalidates refresh tokens, and cuts off access across all 5 connected portals.
- **48-Hour Recovery Window**: Prevents accidental data loss:
  - Account status transitions to `disabled`.
  - A 48-hour recovery countdown begins.
  - The member can submit a renewal request with an explanation.
  - Admins can approve the renewal to restore full access, or decline it.
- **Automated Hard-Purge**:
  - If 48 hours elapse without approval, the scheduled background daemon permanently purges all records, sessions, and tokens from PostgreSQL.
  - A complete personal data export JSON is dispatched to the user's email prior to database record destruction.

### 6. Dual-Bar Paginated Audit Trail
- **Immutability**: Every security event (login, liveness pass/fail, token issuance, admin action, policy toggle) is recorded in PostgreSQL.
- **Performance**: The frontend renders an interactive dual-bar pagination interface:
  - Displays records in fixed pages of 10 entries.
  - Compact header controls (`Prev | Page X of Y | Next`) allow instant navigation without scrolling.
  - Bottom controls provide direct page jumping.
  - All timestamps are standardized to Indian Standard Time (IST - UTC+05:30).

---

## Repository Structure

```
Sankalp_SSO/
├── backend/                         # FastAPI Application Core (Port 8001)
│   ├── app/
│   │   ├── email_assets/            # Embedded RFC 2387 CID image assets (logo, headers)
│   │   ├── email_templates/         # Responsive HTML email templates
│   │   │   ├── admin_2fa_otp.html   # 2-Step verification OTP template
│   │   │   ├── invite.html          # Onboarding invitation template
│   │   │   ├── login_alert.html     # Sign-in security notification
│   │   │   └── password_reset.html  # Password recovery template
│   │   ├── jobs/                    # Scheduled daemons (APScheduler cleanup)
│   │   ├── routes/                  # API route handlers
│   │   │   ├── admin.py             # Admin desk, face profiles, 2FA, renewals
│   │   │   ├── auth.py              # Login, logout, password recovery, session check
│   │   │   ├── liveness.py          # Challenge generation & ticket verification
│   │   │   └── sso.py               # OAuth 2.0 /authorize, /token, and /introspect
│   │   ├── schemas/                 # Pydantic validation models
│   │   ├── services/                # Business logic (email_service, face_engine)
│   │   ├── audit.py                 # Immutable audit logger with PII scrubber
│   │   ├── config.py                # Central environment variables & paths
│   │   ├── database.py              # SQLAlchemy engine & sessionmaker
│   │   ├── models.py                # ORM definitions (User, SsoSession, AuditLog)
│   │   ├── security.py              # Argon2id hashing & JWT cryptographic signing
│   │   └── main.py                  # FastAPI factory & middleware setup
│   ├── models/                      # Pretrained YuNet & SFace ONNX neural weights
│   ├── tests/                       # Complete Pytest test suite (24 automated tests)
│   ├── requirements.txt             # Python backend dependencies
│   └── seed.py                      # Database initialization & demo account seeder
├── frontend/                        # Central Login & Admin Desk (Port 5180, React + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/               # Admin tabs (Members, Approvals, Renewals, Face Lock, Audit)
│   │   │   └── common/              # Common UI components (Navbar, StatusBadge, Modal)
│   │   ├── pages/                   # Views (Login, Signup, Liveness, Admin, Clubs, Renew)
│   │   ├── api.js                   # API client with automatic HttpOnly cookie handling
│   │   └── index.css                # Sankalp editorial design system
│   ├── package.json                 # Node dependencies
│   └── vite.config.js               # Bundler configuration
├── demo-apps/                       # 5 Connected University Portals (Ports 5174–5178)
│   ├── app-a/                       # Photography Club (Port 5174)
│   ├── app-b/                       # Circuit & Robotics Lab (Port 5175)
│   ├── app-c/                       # Turing AI & Coding Society (Port 5176)
│   ├── app-d/                       # Gambit Chess Club (Port 5177)
│   ├── app-e/                       # Titans Athletics Complex (Port 5178)
│   └── serve_demo_apps.py           # Multi-threaded server for all 5 portals
├── docs/                            # Architectural specifications & SRS
├── scripts/                         # Operational management scripts (PowerShell, Bash, Python)
└── README.md                        # Project documentation
```

---

## Connected Campus Club Portals

Sankalp SSO protects five distinct institutional portals, each implementing OAuth 2.0 authorization code validation:

| Portal | Port | Domain | Scope |
|---|---|---|---|
| **Club A: Aperture Photography Club** | `5174` | Creative Arts | Equipment borrowing & darkroom access |
| **Club B: Circuit & Robotics Lab** | `5175` | Engineering | Hardware lab workstation booking |
| **Club C: Turing AI & Coding Society** | `5176` | Computer Science | GPU cluster & repo access |
| **Club D: Gambit Chess & Mind Sports** | `5177` | Sports & Games | Tournament ratings & bracket manager |
| **Club E: Titans Athletics Complex** | `5178` | Campus Recreation | Gymnasium & facility admission |

---

## REST & OAuth 2.0 API Reference

### Authentication Endpoints
- `POST /auth/login`: Validates credentials, checks account status, returns liveness requirement ticket.
- `GET /auth/me`: Returns identity profile and active SSO session status.
- `POST /auth/logout`: Clears central HttpOnly session cookies and invalidates session records.
- `POST /auth/forgot-password`: Issues a secure password reset token via email.
- `POST /auth/reset-password`: Sets a new password using a valid reset token.

### Liveness Endpoints
- `POST /liveness/challenge`: Issues an unguessable 30-second ticket specifying a required physical action (`blink` or `turn_head`).
- `POST /liveness/verify`: Verifies client-side proof against the ticket; on success, establishes the central SSO session.

### OAuth 2.0 / SSO Endpoints
- `GET /sso/authorize`: Validates `client_id` and `redirect_uri`; issues an authorization code if an active session exists, or redirects to login.
- `POST /sso/token`: Exchanges an authorization code and `client_secret` for a signed JWT access token.
- `POST /sso/introspect`: Allows connected services to query the validity and metadata of an access token.

### Administrator Command Desk Endpoints
- `GET /admin/users`: Lists all institutional members with membership status and expiration dates.
- `POST /admin/users/{id}/mark-left`: Instantly revokes member access across all portals and starts the 48-hour recovery countdown.
- `POST /admin/users/{id}/enable`: Reactivates a suspended user account.
- `GET /admin/applications`: Lists pending e-KYC membership applications.
- `POST /admin/applications/{id}/approve`: Approves membership, stores 128D facial vector, and deletes uploaded files.
- `POST /admin/applications/{id}/reject`: Rejects application with reason recorded in the audit log.
- `GET /admin/face-profiles`: Lists enrolled admin facial profiles and lock status.
- `POST /admin/face-profiles`: Enrolls an authorized administrator face profile with a 128D embedding.
- `DELETE /admin/face-profiles/{id}`: Deletes an enrolled face profile.
- `POST /admin/face-profiles/request-disable-otp`: Generates and emails a 6-digit 2FA OTP to authorize disabling biometric lock.
- `POST /admin/face-profiles/verify-disable-otp`: Verifies OTP and disables biometric lock requirement.
- `POST /admin/face-profiles/toggle-restriction`: Toggles biometric lock on; rejects disabling attempts without 2FA (`HTTP 400 2fa_required`).
- `GET /admin/audit`: Returns immutable audit logs with IST timestamps. Supports `limit` parameter.
- `POST /admin/cleanup/run`: Manually triggers the automated account cleanup and purge evaluation.

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 15+ (or SQLite for quick local inspection)
- A modern web browser supporting WebAssembly and camera input (Google Chrome, Edge, Firefox)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ShreyansDey/Sankalp_SSO_with_liveness.git
   cd Sankalp_SSO_with_liveness
   ```

2. **Configure Environment Variables**:
   In `backend/.env` (or copy from `backend/.env.example`):
   ```ini
    DATABASE_URL=postgresql://postgres:your_password@localhost:5432/sankalp_sso
    SECRET_KEY=generate_a_secure_random_key_min_32_chars
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your_email@gmail.com
    SMTP_PASS=your_16_char_app_password
    SMTP_SECURE=tls
    EMAIL_FROM=your_email@gmail.com
    EMAIL_FROM_NAME="Real Access (Sankalp SSO)"
    FRONTEND_ORIGIN=http://localhost:5180
    PURGE_GRACE_HOURS=48
   ```

3. **Install Backend Dependencies & Seed Database**:
   ```bash
   cd backend
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate

   pip install -r requirements.txt
   python seed.py
   ```

4. **Install Frontend Dependencies**:
   ```bash
   cd ../frontend
   npm install
   ```

---

## Running the Application

### Option 1: Multi-Terminal Startup

1. **Start Backend Engine** (Port 8001):
   ```bash
   cd backend
   .venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
   ```

2. **Start Frontend Portal** (Port 5180):
   ```bash
   cd frontend
   npm run dev
   ```

3. **Start All 5 Connected Campus Clubs** (Ports 5174–5178):
   ```bash
   python demo-apps/serve_demo_apps.py
   ```

### Option 2: Automated Service Management Scripts

**On Windows (PowerShell):**
```powershell
.\scripts\start.ps1       # Launches all services in coordinated windows
.\scripts\status.ps1      # Displays health and port status board
.\scripts\stop.ps1        # Gracefully terminates all background services
```

**Cross-Platform Python Manager:**
```bash
python scripts/manager.py start
python scripts/manager.py status
python scripts/manager.py stop
```

---

## Verification & Automated Test Suite

The platform includes a test suite covering the entire identity lifecycle:
- Argon2id password hashing and JWT validation
- Liveness challenge generation, expiration, and rate limiting
- 128D cosine similarity mathematics
- e-KYC application submission, approval, and rejection
- Administrator face lock enforcement gating
- Privileged 2-Step Verification (2FA) OTP validation
- 48-hour recovery countdown and permanent database hard-purge
- OAuth 2.0 authorization code and token exchange

To execute all 24 automated tests:
```bash
pytest backend/tests -v
```

Expected output:
```
============================= test session starts =============================
backend/tests/test_admin_and_cleanup.py::test_admin_and_cleanup_flow PASSED
backend/tests/test_auth.py::test_healthcheck PASSED
backend/tests/test_auth.py::test_signup_valid_invite PASSED
backend/tests/test_auth.py::test_signup_used_invite_fails PASSED
backend/tests/test_auth.py::test_login_wrong_password_fails PASSED
backend/tests/test_auth.py::test_login_disabled_user_fails PASSED
backend/tests/test_auth.py::test_login_valid_credentials_requires_liveness PASSED
backend/tests/test_auth.py::test_forgot_password_generates_token PASSED
backend/tests/test_auth.py::test_verify_and_reset_password_flow PASSED
backend/tests/test_auth.py::test_admin_must_use_password_and_liveness PASSED
backend/tests/test_ekyc_and_biometrics.py::test_cosine_similarity_mathematics PASSED
backend/tests/test_ekyc_and_biometrics.py::test_ekyc_apply_and_admin_approval_lifecycle PASSED
backend/tests/test_ekyc_and_biometrics.py::test_ekyc_admin_rejection PASSED
backend/tests/test_ekyc_and_biometrics.py::test_liveness_with_biometric_face_matching PASSED
backend/tests/test_ekyc_and_biometrics.py::test_admin_face_lock_enforcement_gating PASSED
backend/tests/test_liveness.py::test_liveness_flow PASSED
backend/tests/test_liveness.py::test_liveness_rate_limit PASSED
backend/tests/test_renewal_and_48h_purge.py::test_mark_as_left_initializes_48h_recovery_window PASSED
backend/tests/test_renewal_and_48h_purge.py::test_user_submit_and_admin_approve_renewal PASSED
backend/tests/test_renewal_and_48h_purge.py::test_admin_decline_renewal PASSED
backend/tests/test_renewal_and_48h_purge.py::test_48_hour_hard_purge_execution PASSED
backend/tests/test_renewal_and_48h_purge.py::test_window_expired_blocks_late_renewal PASSED
backend/tests/test_sso.py::test_sso_full_flow PASSED
backend/tests/test_sso.py::test_authorize_wrong_redirect_uri_rejected PASSED
======================== 24 passed in 4.50s ==================================
```

---

## Honest Security Limits

Every cryptographic and biometric access control system has defined boundaries:

1. **Liveness Scope**: Client-side MediaPipe landmark analysis reliably prevents attacks using printed photographs, smartphone screens, tablets, and looped video streams. Real-time generative neural deepfakes (e.g., live diffusion face swapping via virtual camera devices) represent a separate threat vector and are an area for future hardware-backed attestation.
2. **Presence vs. Identification (Member Tier)**: For regular club members, liveness verifies that a live human being is present at the terminal during authentication. It deliberately avoids comparing against a static portrait database to preserve student privacy.
3. **Identification (Admin Tier)**: Administrator authentication verifies both live presence and facial identity matching against enrolled 128D embeddings.
4. **Out-of-Band Security**: The privileged 2FA mechanism assumes the administrator's designated mailbox remains secure. If the administrator email account is compromised, the out-of-band gate can be traversed.

---

## Team & Credits

- **Project**: Real Person, Real Access (Sankalp SSO)
- **Team**: Sankalp
  - **Shreyans Dey**
  - **Arka Paul**
- **Event**: Hack N Pitch 2026, Jadavpur University E-Cell
- **Track**: Cybersecurity & Digital Identity
- **License**: MIT License


---

## Universal External SSO Integration & First-Time Superuser Bootstrap (v2.0)

Any external web app, ERP, or SaaS system can connect to Sankalp SSO using standard OAuth2 / OIDC + PKCE and scoped REST API keys:

### 1. Set Your First-Time Superuser Creation Primary Key
Run the interactive cross-OS generator CLI or open `/setup` on a fresh instance:
```bash
python scripts/generate_key.py
```
This prompts you to input your own **First-Time Superuser Creation Primary Key** (plus optional bootstrap username/password) and mints an initial `sk_live_...` API key. Use that Primary Key on `/setup` (or `POST /api/v1/setup/bootstrap-superuser`) to create the very first Super Admin credential; bootstrap locks permanently once complete.

### 2. Connect External Applications
- **OIDC Discovery:** `GET /.well-known/openid-configuration`
- **Integration Discovery:** `GET /api/v1/integrations/discovery`
- **Register App / Rotate Secret:** `POST /api/v1/integrations/apps` (`X-API-Key: sk_live_...`)
- **Introspect / Revoke Tokens:** `POST /token/introspect`, `POST /token/revoke`
- **Download Immutable Audit & Stress Reports:** `GET /api/v1/reports`
