# stack-and-setup.md — Technology Stack & Setup Guide

**Project:** Real Person, Real Access · **Product:** Sankalp SSO  
**Team:** Sankalp (Shreyans Dey, Arka Paul) · **Event:** Hack N Pitch 2026, Jadavpur University E-Cell  

---

## 🛠️ 1. Technology Stack Breakdown (Plain English)

Sankalp SSO combines modern, battle-tested open-source technologies:

```mermaid
flowchart TD
    subgraph FrontendTech ["Frontend (UI & Computer Vision)"]
        React["React 19 (Component-Based UI)"]
        Vite["Vite 6 (Ultra-Fast Build & Dev Server)"]
        MediaPipe["MediaPipe Face Mesh (468 3D Landmarks in Browser)"]
        TailwindCSS["Modern CSS Styling (Responsive Glassmorphism)"]
    end

    subgraph BackendTech ["Backend (API & Security Core)"]
        Python["Python 3.11+ (Core Language)"]
        FastAPI["FastAPI (High-Performance Async Web Framework)"]
        Uvicorn["Uvicorn (Lightning-Fast ASGI Server)"]
        SQLAlchemy["SQLAlchemy (ORM Database Abstraction)"]
        PyJWT["PyJWT (JSON Web Token Signing & Validation)"]
        Argon2["Argon2-cffi (Memory-Hard Password Hashing)"]
        OpenCV["OpenCV YuNet + SFace (Deep Learning Face Verification)"]
        APScheduler["APScheduler (Background Janitor Task Daemon)"]
    end

    subgraph StorageTech ["Storage & Persistence"]
        SQLite["SQLite (Zero-Config In-Memory/Local Storage)"]
        Postgres["PostgreSQL 15+ (Production Relational Database)"]
        LocalDisk["Local File Storage (Encrypted e-KYC Vault)"]
    end

    FrontendTech <-->|REST API + Cookies| BackendTech
    BackendTech <-->|SQL Queries| StorageTech
```

---

## 💻 2. Prerequisites & Installation

### Required Software
- **Python 3.11+**: Core backend runtime.
- **Node.js 20+** & **npm**: Frontend runtime and package manager.
- **Chromium-based Browser** (Google Chrome or Microsoft Edge): Provides camera access on `localhost`.
- **Git**: Version control.

---

## 🚀 3. Step-by-Step Manual Setup

### 3.1. Backend Setup
```bash
# 1. Navigate to backend directory
cd backend

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# On Windows (Command Prompt):
.\venv\Scripts\activate.bat
# On Linux / macOS:
source venv/bin/activate

# 4. Install backend dependencies
pip install -r requirements.txt

# 5. Initialize seed database (Creates admin user & demo products)
python seed.py

# 6. Start FastAPI server on port 8000
uvicorn app.main:app --reload --port 8000
```

### 3.2. Frontend Setup (Central Gateway)
```bash
# 1. Open a new terminal and navigate to frontend directory
cd frontend

# 2. Install Node.js packages
npm install

# 3. Start Vite development server on port 5173
npm run dev
```

### 3.3. Demo Applications Setup (5 Connected Campus Clubs)
```bash
# 1. Open a third terminal and run the multi-port server
python demo-apps/serve_demo_apps.py
```

---

## ⚡ 4. One-Click Automated Startup Scripts

For convenience during hackathon demonstrations, pre-built scripts manage all three processes in a single command:

| Script | Purpose | Command (Windows) | Command (Linux/Mac) |
|---|---|---|---|
| **Start Everything** | Boots Backend (:8000), Frontend (:5173), and 5 Clubs (:5174–:5178) | `.\start.bat` | `./start.sh` |
| **Check Status** | Shows running processes and port health | `.\status.bat` | `./status.sh` |
| **Stop Everything** | Gracefully terminates all background servers | `.\stop.bat` | `./stop.sh` |
| **Restart All** | Reboots all services cleanly | `.\restart.bat` | `./restart.sh` |

---

## 🌐 5. Port Allocations & Network Topology

| Service | Port | Local URL | Description |
|---|---|---|---|
| **FastAPI Backend** | `8000` | `http://localhost:8000` | REST API, OpenAPI docs (`/docs`), Biometrics |
| **Central Identity Gateway** | `5173` | `http://localhost:5173` | Login, e-KYC Onboarding, Liveness Screen, Admin Desk |
| **App A: Photography Club** | `5174` | `http://localhost:5174` | Connected Campus Club Demo App 1 |
| **App B: Robotics Lab** | `5175` | `http://localhost:5175` | Connected Campus Club Demo App 2 |
| **App C: Coding & AI Club** | `5176` | `http://localhost:5176` | Connected Campus Club Demo App 3 |
| **App D: Chess & Mind Sports** | `5177` | `http://localhost:5177` | Connected Campus Club Demo App 4 |
| **App E: Athletics & Sports** | `5178` | `http://localhost:5178` | Connected Campus Club Demo App 5 |

---

## ⚙️ 6. Environment Configuration (`backend/.env`)

The backend configuration is managed via an environment file (`backend/.env`). **Never commit this file to public repositories.**

```ini
# Database Connection (SQLite default for local hackathon, PostgreSQL for production)
DATABASE_URL=sqlite:///./sankalp.db
# DATABASE_URL=postgresql://sankalp_user:secure_password@localhost:5432/sankalp

# Cryptographic Keys (Ensure high entropy in production)
JWT_SECRET=sankalp-super-secret-jwt-key-for-jadavpur-hackathon-2026-very-long-string-32bytes

# Token Lifespans & Security Rules
ACCESS_TOKEN_MINUTES=10
SSO_SESSION_HOURS=8
INACTIVITY_DAYS=60

# Presentation & Network Origins
FRONTEND_ORIGIN=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177,http://localhost:5178

# Automated Background Janitor Daemon
ENABLE_SCHEDULER=true

# Institutional SMTP Configuration (For Password Recovery)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sankalp.auth.system@gmail.com
SMTP_PASSWORD=your_app_specific_password_here
SMTP_FROM=sankalp.auth.system@gmail.com
```

---

## 📷 7. Camera & Browser Setup Notes

- **Camera Permissions**: Modern browsers permit camera access only on `http://localhost` or secure `https://` origins. Running on `localhost` ensures camera access works offline without requiring external SSL certificates.
- **Lighting**: Front lighting is recommended for optimal facial landmark regression. Avoid placing bright windows directly behind the user's head to prevent backlighting silhouetting.
