# Sankalp SSO — Service Management Scripts

Unified one-click automation scripts to **Setup**, **Start**, **Stop**, **Restart**, and check **Status** of the entire Sankalp SSO platform.

---

## Managed Services & Ports

| Service | Technology | Port | URL |
|---|---|---|---|
| **Central Login & Admin** | React (Vite) | `5180` | http://localhost:5180 |
| **Auth Backend API & Docs** | Python (FastAPI / Uvicorn) | `8001` | http://localhost:8001/docs |
| **Club 1: Photography Club** | HTML / JS Demo App | `5174` | http://localhost:5174 |
| **Club 2: Robotics Lab** | HTML / JS Demo App | `5175` | http://localhost:5175 |
| **Club 3: Coding & AI Club** | HTML / JS Demo App | `5176` | http://localhost:5176 |
| **Club 4: Chess & Mind Sports** | HTML / JS Demo App | `5177` | http://localhost:5177 |
| **Club 5: Athletics & Sports** | HTML / JS Demo App | `5178` | http://localhost:5178 |

---

## Quick Start (Setup & Launch)

### Step 1: Initial Setup (Run Once)
Installs all backend Python packages, frontend npm dependencies, and seeds initial demo users and campus products.

* **Windows (PowerShell)**:
  ```powershell
  .\scripts\setup.ps1
  ```
* **Windows (CMD / Batch)**:
  ```cmd
  scripts\setup.bat
  ```
* **Linux / macOS**:
  ```bash
  chmod +x scripts/*.sh
  ./scripts/setup.sh
  ```

---

### Step 2: Start All Services

* **Windows (PowerShell)**:
  ```powershell
  # Default: Launches backend, demo apps, and frontend in live interactive windows
  .\scripts\start.ps1

  # Background daemon mode (silent background processes with healthcheck)
  .\scripts\start.ps1 -Background

  # Foreground mode (live terminal output)
  .\scripts\start.ps1 -Foreground
  ```
* **Windows (CMD / Batch)**:
  ```cmd
  scripts\start.bat
  ```
* **Linux / macOS**:
  ```bash
  ./scripts/start.sh
  ```

---

### Step 3: Check System Status

* **Windows (PowerShell)**:
  ```powershell
  .\scripts\status.ps1
  ```
* **Windows (CMD / Batch)**:
  ```cmd
  scripts\status.bat
  ```
* **Linux / macOS**:
  ```bash
  ./scripts/status.sh
  ```

---

### Step 4: Stop All Services

Stops all background processes and frees up ports 8001, 5180, and 5174–5178:

* **Windows (PowerShell)**:
  ```powershell
  .\scripts\stop.ps1
  ```
* **Windows (CMD / Batch)**:
  ```cmd
  scripts\stop.bat
  ```
* **Linux / macOS**:
  ```bash
  ./scripts/stop.sh
  ```

---

### Step 5: Restart All Services

Cleanly stops all services and starts them back up:

* **Windows (PowerShell)**:
  ```powershell
  .\scripts\restart.ps1
  ```
* **Windows (CMD / Batch)**:
  ```cmd
  scripts\restart.bat
  ```
* **Linux / macOS**:
  ```bash
  ./scripts/restart.sh
  ```

---

## Default Seeded Credentials

| Role | Email | Password | Allowed Access |
|---|---|---|---|
| **System Admin** | `admin@sankalp.local` | `AdminPass123!` | Central Admin Panel, All Clubs, User Revocation |
| **Active Student** | `rahul@student.ju.ac.in` | `StudentPass123!` | All Connected Campus Clubs (Apps A – E) |
| **Expired Student** | `expired@student.ju.ac.in` | `StudentPass123!` | Term expired (auto-blocked at login) |
