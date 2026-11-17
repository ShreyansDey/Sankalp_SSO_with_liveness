# Real Person, Real Access — Sankalp SSO & Digital Identity

[![CI Pipeline](https://github.com/team-sankalp/sankalp-sso/actions/workflows/ci.yml/badge.svg)](https://github.com/team-sankalp/sankalp-sso)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)](https://fastapi.tiangolo.com)
[![React 18](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev)

A lightweight, self-hosted Single Sign-On (SSO) and digital identity system for colleges, university clubs, and small teams. Built by **Team Sankalp** (Shreyans Dey & Arka Paul) for **Hack N Pitch 2026** at Jadavpur University (Track: *Cybersecurity & Digital Identity*).

---

## The Problem
Former members leave clubs and universities, but their accounts stay active for months. Passwords alone cannot prove that a real human being is physically present, and busy team leaders rarely clean up orphaned accounts.

> **Example:** Rahul left the university photography club in June. In November, his login still works and accesses lab equipment and sensitive materials.

## The Solution
1. **One Login**: Sign in once, open every connected product (App A, App B) in one click.
2. **A Real Person**: An in-browser camera check (blink or head turn) proves a live human is present. Only `pass` or `fail` is stored — video frames never leave the user's browser.
3. **Instant Access Removal**: When someone leaves, an admin clicks **"Mark as left"** and their access to every connected app is revoked immediately.
4. **Automated Lifecycle Cleanup**: Background jobs automatically disable accounts when their term end date passes or when members remain inactive.

---

## System Architecture

```
                  ┌───────────────────────────────────────────────┐
                  │                 User Browser                  │
                  └──────┬────────────────────────────────┬───────┘
                         │ 1. No token                    │ 5. One-click SSO
                         ▼                                ▼
            ┌────────────────────────┐       ┌────────────────────────┐
            │   App A: Photography   │       │   App B: Robotics Lab  │
            │     (Port 5174)        │       │     (Port 5175)        │
            └────────────┬───────────┘       └────────────┬───────────┘
                         │ 2. Redirect /authorize         │
                         ▼                                │
            ┌─────────────────────────────────────────────┴┐
            │         Central Login & Identity (React)     │
            │                  (Port 5173)                 │
            │   - Email / Password Login                   │
            │   - In-Browser MediaPipe Face Mesh Liveness  │
            │   - Pass/Fail only to Auth Server            │
            └──────────────────────┬───────────────────────┘
                                   │
                                   ▼
            ┌──────────────────────────────────────────────┐
            │             Auth Server (FastAPI)            │
            │                  (Port 8000)                 │
            │   - Argon2 Password & Token Hashing          │
            │   - Signed JWT Access Tokens (10 min)        │
            │   - Revocable Refresh Tokens (30 days)       │
            │   - Central SSO Session Cookies (HttpOnly)   │
            │   - Daily APScheduler Cleanup Job            │
            └───────────┬──────────────────────┬───────────┘
                        │                      │
                        ▼                      ▼
         ┌────────────────────────┐  ┌────────────────────────┐
         │  SQLite / PostgreSQL   │  │ Admin Console (React)  │
         │  (data-model.md schema)│  │ - "Mark as left"       │
         └────────────────────────┘  │ - Term cleanup trigger │
                                     │ - Live audit log trail │
                                     └────────────────────────┘
```

---

## Folder & Repository Structure

```
Sankalp_prep_pack/
├── backend/                         # FastAPI backend
│   ├── app/
│   │   ├── routes/                  # API routes (auth, liveness, sso, admin)
│   │   ├── jobs/                    # APScheduler automated lifecycle jobs
│   │   ├── models.py                # SQLAlchemy models (users, invites, products, sessions)
│   │   ├── security.py              # Argon2 password & token hashing, JWT signing
│   │   ├── audit.py                 # Sanitized audit logger (14 fixed actions)
│   │   ├── config.py                # Environment configuration loader
│   │   ├── database.py              # Multi-engine DB connection (SQLite/PostgreSQL)
│   │   ├── deps.py                  # Session & token authentication dependencies
│   │   └── main.py                  # FastAPI application entrypoint & lifespan
│   ├── tests/                       # Pytest automated test suite (11 test cases)
│   ├── seed.py                      # Database initialization and demo accounts
│   ├── requirements.txt             # Python backend dependencies
│   ├── Dockerfile                   # Backend Docker container definition
│   └── .env.example                 # Documented environment variables
├── frontend/                        # Vite React central login & admin console
│   ├── src/
│   │   ├── pages/                   # Login, Signup, Liveness, Admin Console
│   │   ├── api.js                   # Authenticated API client with credentials
│   │   ├── index.css                # Polished design system
│   │   ├── App.jsx                  # React Router routes
│   │   └── main.jsx                 # Vite application mount
│   ├── index.html                   # MediaPipe Face Mesh & typography
│   ├── package.json                 # Node dependencies
│   ├── vite.config.js               # Vite bundler configuration (port 5173)
│   └── Dockerfile                   # Frontend Docker container definition
├── demo-apps/                       # Connected client products
│   ├── app-a/                       # Photography Club Portal (port 5174)
│   ├── app-b/                       # Robotics Research Lab (port 5175)
│   ├── serve_demo_apps.py           # Dual-server static runner with SPA fallback
│   └── Dockerfile                   # Demo apps container definition
├── docs/
│   ├── modules/                     # Per-module documentation (01 to 07)
│   │   ├── 00-index.md              # Status tracker for all 7 modules
│   │   ├── 01-auth-core.md          # Signup, login, and sessions
│   │   ├── 02-sso-flow.md           # Authorize, token issuance, and refresh
│   │   ├── 03-liveness.md           # MediaPipe face mesh & anti-spoofing
│   │   ├── 04-admin-dashboard.md    # Mark as left & member management
│   │   ├── 05-cleanup-job.md        # Term end & inactivity automated expiry
│   │   ├── 06-audit-log.md          # Tamper-evident event log
│   │   └── 07-demo-apps.md          # Photography Club & Robotics Lab
│   └── _module-template.md          # Architectural documentation template
├── scripts/
│   └── dev.ps1                      # Windows PowerShell one-click launcher
├── .github/workflows/
│   └── ci.yml                       # GitHub Actions CI workflow (lint, test, build)
├── docker-compose.yml               # Multi-container local orchestration
├── run_all.py                       # Cross-platform development runner
├── data-model.md                    # Database tables and audit action specification
├── api.md                           # REST API endpoint contracts
├── security.md                      # Threat model and mitigation matrix
├── srs.md                           # Software requirements specification
├── demo-script.md                   # 4-minute presentation demo script
├── test-checklist.md                # Verification test checklist with metrics
└── todos.md                         # Milestone tracking
```

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- Google Chrome or Microsoft Edge (for webcam access)

### Method 1: Cross-Platform Single Command
Run the unified development launcher from the repository root:
```bash
python run_all.py
```
This automatically seeds the database, starts the FastAPI server, boots up Vite, and launches both demo apps.

### Method 2: Manual Multi-Terminal Startup

1. **Start Backend (Port 8000)**:
   ```bash
   cd backend
   pip install -r requirements.txt
   python seed.py
   uvicorn app.main:app --reload --port 8000
   ```

2. **Start Frontend (Port 5173)**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Start Demo Apps (Ports 5174 & 5175)**:
   ```bash
   python demo-apps/serve_demo_apps.py
   ```

### Method 3: Docker Compose
```bash
docker-compose up --build
```

---

## Pre-Seeded Demo Credentials

| Role | Email | Password | Purpose |
|---|---|---|---|
| **Admin** | `admin@jadavpur.edu` | `AdminPassword123!` | Admin console, user management, audit review |
| **Member (Rahul)** | `rahul@club.edu` | `RahulPassword123!` | Active member for demo steps 1 to 4 |
| **Expired Member** | `expired@club.edu` | `ExpiredPassword123!` | Term expired 30 days ago (for demo step 5) |
| **Inactive Member** | `inactive@club.edu` | `InactivePassword123!` | Inactive for 90 days (auto-cleanup target) |

---

## 4-Minute Presentation Walkthrough (`demo-script.md`)

1. **Step 1 — Sign In Once (45s)**:
   - Navigate to `http://localhost:5174` (App A).
   - Click **"Sign In with Sankalp SSO"**.
   - Enter `rahul@club.edu` and `RahulPassword123!`.
   - Complete the camera liveness challenge ("Blink twice").
   - You are redirected back to App A with **"Welcome, Rahul Sharma!"**.

2. **Step 2 — One-Click Part (30s)**:
   - Click the green button **"⚡ Open App B (One-Click SSO Part)"** to open `http://localhost:5175`.
   - Click **"Sign In with Sankalp SSO"**.
   - Notice that **no password form** and **no camera prompt** appear. You are logged into App B instantly!

3. **Step 3 — Show Still Photo Fails (30s)**:
   - Log out, or open an incognito window.
   - Attempt login and hold a printed still photo up to the camera (or click **"Test Still Photo (Fail)"** in the presentation controls).
   - The system detects lack of motion/blinking, the 30-second timer expires, and the attempt is logged as `liveness_fail`.

4. **Step 4 — Rahul Leaves (45s)**:
   - Open `http://localhost:5173/admin` in a new tab as Admin (`admin@jadavpur.edu`).
   - Find Rahul in the member list and click **"Mark as left"**.
   - Switch back to App A and App B tabs and refresh or click "Test Access Token".
   - **Both apps immediately display "⛔ ACCESS DENIED"**.

5. **Step 5 — Automatic Cleanup (30s)**:
   - In the Admin console, navigate to the **"Automated Cleanup"** tab.
   - Click **"Run Cleanup Job Now"**.
   - The job automatically disables the expired student account and logs `user_disabled_auto` in the audit log.

---

## Automated Test Suite

Run all 11 backend automated tests covering authentication, liveness codes, rate limits, OAuth2 authorization, token refreshing, and admin lifecycle rules:
```bash
pytest backend/tests -v
```

---

## Honest Security Limits
1. **Liveness Scope**: MediaPipe in the browser reliably stops printed photos, digital screen replays, and video loops. Real-time generative deepfakes represent future work.
2. **Presence vs Identity**: Liveness proves a live human being is present; it does not match against a saved facial biometric photo (ensuring maximum privacy).
3. **Client-side Verification**: The browser computes the gesture detection. To prevent tampering, challenges use random action selection, short 30-second one-time codes, strict 5-per-10-minute rate limits, and full audit logging.

---

## License
MIT License. Built for Hack N Pitch 2026, Jadavpur University E-Cell.
