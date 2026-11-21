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
├── backend/                         # FastAPI Application Core (Port 8001)
│   ├── app/
│   │   ├── routes/                  # API endpoints (auth, liveness, sso, admin)
│   │   ├── schemas/                 # Pydantic request & response validation schemas
│   │   ├── services/                # Business logic (email_service, face_engine)
│   │   ├── jobs/                    # APScheduler background tasks (cleanup.py)
│   │   ├── models.py                # SQLAlchemy ORM schemas (users, products, sessions, audit)
│   │   ├── security.py              # Argon2id password hashing, JWT signing, token hashing
│   │   ├── audit.py                 # Immutable audit logger with PII scrubber
│   │   ├── config.py                # Centralized environment loader & config
│   │   ├── database.py              # SQLAlchemy multi-engine DB engine & sessionmaker
│   │   ├── deps.py                  # Auth guards & dependency injection
│   │   └── main.py                  # FastAPI app factory, lifespan, & CORS configuration
│   ├── models/                      # Pretrained OpenCV YuNet & SFace ONNX neural net weights
│   ├── uploads/                     # Storage vault for e-KYC documents & face snapshots
│   ├── tests/                       # Pytest test suite with isolated in-memory DB
│   ├── check_db.py                  # Database inspection & storage verification CLI
│   ├── seed.py                      # Database initialization & demo account seeder
│   ├── test_full_system.py          # End-to-end e-KYC & biometric verification runner
│   ├── requirements.txt             # Python backend dependencies
│   ├── Dockerfile                   # Backend Docker container definition
│   └── .env.example                 # Documented environment variables
├── frontend/                        # Central Login & Admin Portal (Port 5180, React + Vite)
│   ├── src/
│   │   ├── components/              # Modular UI components
│   │   │   ├── common/              # Reusable UI (Navbar, StatusBadge, AlertBanner, Modal, Spinner)
│   │   │   └── admin/               # Admin Console tabs (Members, Applications, Renewals, Invites, etc.)
│   │   ├── pages/                   # Application views (Login, Signup, Liveness, Admin, Clubs, Renew)
│   │   ├── context/                 # Centralized state (AuthContext & useAuth hook)
│   │   ├── constants/               # System constants (campus club definitions & ports)
│   │   ├── utils/                   # Data formatters & time calculations
│   │   ├── api.js                   # Authenticated HTTP client with credentials
│   │   ├── index.css                # Polished design system
│   │   ├── App.jsx                  # Client-side routing table
│   │   └── main.jsx                 # Vite application mount
│   ├── public/                      # Static assets & club imagery
│   ├── index.html                   # HTML entrypoint & typography
│   ├── package.json                 # Node dependencies
│   ├── vite.config.js               # Vite bundler configuration (port 5180)
│   └── Dockerfile                   # Frontend Docker container definition
├── demo-apps/                       # 5 Connected University Campus Clubs (Ports 5174–5178)
│   ├── app-a/                       # Club A: Photography Club (Port 5174)
│   ├── app-b/                       # Club B: Robotics Lab (Port 5175)
│   ├── app-c/                       # Club C: Coding & AI Society (Port 5176)
│   ├── app-d/                       # Club D: Chess & Mind Sports (Port 5177)
│   ├── app-e/                       # Club E: Athletics & Sports Complex (Port 5178)
│   ├── serve_demo_apps.py           # Multi-port static server with SPA fallback
│   └── Dockerfile                   # Demo apps container definition
├── docs/
│   ├── specs/                       # Architectural specifications & requirements
│   │   ├── srs.md                   # Software Requirements Specification
│   │   ├── architecture.md          # System architecture, topology, & sequence diagrams
│   │   ├── data-model.md            # Database schema & audit event catalog
│   │   ├── api.md                   # REST API endpoint specifications
│   │   ├── security.md              # Threat model & cryptographic mitigations
│   │   ├── build-plan.md            # Implementation roadmap & phase checkpoints
│   │   ├── stack-and-setup.md       # Development setup guide
│   │   ├── demo-script.md           # 4-minute presentation demo script
│   │   ├── test-checklist.md        # Pre-flight verification checklist
│   │   └── todos.md                 # Milestone tracking
│   ├── modules/                     # Detailed module documentation (00 to 08)
│   └── _module-template.md          # Architectural documentation template
├── scripts/
│   ├── start.ps1 / start.bat / start.sh     # One-click start all services
│   ├── stop.ps1 / stop.bat / stop.sh        # One-click stop all services & release ports
│   ├── restart.ps1 / restart.bat / restart.sh # One-click restart services
│   ├── status.ps1 / status.bat / status.sh   # Service status board
│   ├── setup.ps1 / setup.bat / setup.sh     # One-click setup dependencies
│   ├── manager.py                           # Cross-platform Python lifecycle manager
│   ├── dev.ps1                              # Windowed developer launcher
│   └── README.md                            # Complete scripts documentation
├── .github/workflows/
│   └── ci.yml                       # GitHub Actions CI workflow (lint, test, build)
├── docker-compose.yml               # Multi-container local orchestration
├── start.bat / start.ps1            # Root convenience start shortcuts
├── stop.bat / stop.ps1              # Root convenience stop shortcuts
├── restart.bat / restart.ps1        # Root convenience restart shortcuts
├── status.bat / status.ps1          # Root convenience status shortcuts
├── agents.md                        # Assistant & Developer Working Rules
└── README.md                        # Project Overview
```

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- Google Chrome or Microsoft Edge (for webcam access)

### Method 1: Single-Command Scripts (Windows / Mac / Linux)

**On Windows (PowerShell):**
```powershell
.\scripts\start.ps1       # Start whole system
.\scripts\status.ps1      # Check service status
.\scripts\restart.ps1     # Restart whole system
.\scripts\stop.ps1        # Stop whole system
```

**On Windows (CMD / Double-Click):**
```cmd
scripts\start.bat
scripts\restart.bat
scripts\stop.bat
```

**On Linux / macOS:**
```bash
./scripts/start.sh
./scripts/restart.sh
./scripts/stop.sh
```

**Cross-Platform Python:**
```bash
python scripts/manager.py start
python scripts/manager.py status
python scripts/manager.py restart
python scripts/manager.py stop
```

### Method 2: Interactive Development Runner
Run the interactive foreground launcher:
```bash
python run_all.py
```
This automatically seeds the database, starts the FastAPI server, boots up Vite, and launches both demo apps.

### Method 2: Manual Multi-Terminal Startup

1. **Start Backend (Port 8001)**:
   ```bash
   cd backend
   pip install -r requirements.txt
   python seed.py
   uvicorn app.main:app --reload --port 8001
   ```

2. **Start Frontend (Port 5180)**:
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

## Project Structure & Documentation Index

All core project specifications and detailed module docs are cleanly organized:

```
Sankalp_SSO/
├── docs/
│   ├── specs/                   # System Specifications & Guidelines
│   │   ├── srs.md               # Software Requirements Specification (M1-M8, FR1-FR7)
│   │   ├── architecture.md      # System Architecture & Token Lifecycle
│   │   ├── data-model.md        # Database Schema & Audit Event Catalog
│   │   ├── api.md               # REST & OAuth 2.0 API Endpoints
│   │   ├── security.md          # Threat Model & Privacy Guarantees
│   │   ├── build-plan.md        # Step-by-Step Implementation Roadmap
│   │   ├── stack-and-setup.md   # Local Development Setup Guide
│   │   ├── demo-script.md       # 4-Minute Presentation Walkthrough
│   │   ├── test-checklist.md    # Pre-Flight Verification Checklist
│   │   └── todos.md             # Project Milestones & Completion Tracking
│   └── modules/                 # Technical Module Documentation (with full code & explanations)
│       ├── 00-index.md          # Status Index of all Modules
│       ├── 01-auth-core.md      # Password Hashing, Sessions & Invites
│       ├── 02-sso-flow.md       # OAuth 2.0 Auth Code & Token Exchange
│       ├── 03-liveness.md       # MediaPipe Face Mesh Challenge & Result Verification
│       ├── 04-admin-dashboard.md# Admin Controls & Instant "Mark as Left"
│       ├── 05-cleanup-job.md    # Automated APScheduler Lifecycle Cleanup
│       ├── 06-audit-log.md      # Security Audit Trail
│       └── 07-demo-apps.md      # 5 Connected University Campus Clubs
├── backend/                     # FastAPI Backend Server (Port 8001)
├── frontend/                    # Central Login & Clubs Hub (Port 5180, React + Vite)
├── demo-apps/                   # 5 Connected University Portals (Ports 5174 - 5178)
├── scripts/                     # Start/Stop Automation & Service Manager
├── agents.md                    # Assistant & Developer Working Rules
└── README.md                    # Project Overview
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
   - Open `http://localhost:5180/admin` in a new tab as Admin (`admin@jadavpur.edu`).
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
