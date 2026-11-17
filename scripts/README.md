# Sankalp SSO — Service Management Scripts

Unified one-click automation scripts to **Start**, **Stop**, **Restart**, and check **Status** of the entire Sankalp SSO platform.

---

## Managed Services

| Service | Technology | Port | URL |
|---|---|---|---|
| **Central Login & Admin** | React (Vite) | `5173` | http://localhost:5173 |
| **Auth Backend API** | Python (FastAPI / Uvicorn) | `8000` | http://localhost:8000/docs |
| **Demo App A** | Photography Club Portal | `5174` | http://localhost:5174 |
| **Demo App B** | Robotics Lab Portal | `5175` | http://localhost:5175 |

---

## One-Click Commands

### 1. PowerShell (Windows)
```powershell
# Start all services in background with healthcheck
.\scripts\start.ps1

# Start in foreground (interactive logs)
.\scripts\start.ps1 -Foreground

# Start in separate interactive terminal windows
.\scripts\start.ps1 -Windowed

# Check live status of all ports and PIDs
.\scripts\status.ps1

# Restart all services cleanly
.\scripts\restart.ps1

# Stop all services and release all ports
.\scripts\stop.ps1
```

### 2. Windows Batch (CMD / File Explorer)
Double-click or run from CMD:
```cmd
scripts\start.bat
scripts\restart.bat
scripts\stop.bat
```

### 3. Linux / macOS / Bash
```bash
chmod +x scripts/*.sh

# Start services
./scripts/start.sh

# Restart services
./scripts/restart.sh

# Stop services
./scripts/stop.sh
```

### 4. Direct Python Manager (Cross-Platform)
```bash
python scripts/manager.py start      # Starts services in background
python scripts/manager.py start --fg # Starts services in foreground
python scripts/manager.py status     # Shows live service status board
python scripts/manager.py restart    # Gracefully stops, frees ports, and restarts
python scripts/manager.py stop       # Stops all processes and clears PIDs
```

---

## Log Output
When running in the background, logs are streamed to:
- `logs/backend.log`
- `logs/frontend.log`
- `logs/demo-apps.log`
