#!/usr/bin/env python3
"""
Sankalp SSO System Manager
Controls lifecycle: start, stop, restart, and status of all services:
 - Backend API (FastAPI)       -> http://localhost:8001
 - Central Frontend (Vite)     -> http://localhost:5180
 - Demo Apps (App A & App B)   -> http://localhost:5174 & 5175
"""

import sys
import os
import time
import json
import subprocess
import signal
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
PID_FILE = ROOT_DIR / "scripts" / ".pids.json"
LOG_DIR = ROOT_DIR / "logs"

PORTS = {
    "Backend (FastAPI)": 8001,
    "Central Login (Vite)": 5180,
    "Demo App A (Photo Club)": 5174,
    "Demo App B (Robotics Lab)": 5175,
    "Demo App C (Coding & AI)": 5176,
    "Demo App D (Chess Club)": 5177,
    "Demo App E (Athletics Club)": 5178
}

def ensure_log_dir():
    LOG_DIR.mkdir(exist_ok=True)

def get_pids_by_port(port):
    """Find process IDs listening on a specific TCP port (cross-platform)."""
    pids = set()
    if sys.platform == "win32":
        try:
            output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
            for line in output.strip().splitlines():
                parts = line.strip().split()
                if len(parts) >= 5 and "LISTENING" in line.upper():
                    pid = int(parts[-1])
                    if pid > 0:
                        pids.add(pid)
        except Exception:
            pass
    else:
        try:
            output = subprocess.check_output(f"lsof -t -i:{port}", shell=True).decode()
            for line in output.strip().splitlines():
                if line.strip():
                    pids.add(int(line.strip()))
        except Exception:
            pass
    return pids

def kill_pid(pid):
    """Safely terminate a process by PID."""
    if pid <= 0 or pid == os.getpid():
        return
    try:
        if sys.platform == "win32":
            subprocess.run(f"taskkill /F /T /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            os.kill(pid, signal.SIGKILL)
    except Exception:
        pass

def load_saved_pids():
    if PID_FILE.exists():
        try:
            with open(PID_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_pids(pids_dict):
    with open(PID_FILE, "w") as f:
        json.dump(pids_dict, f, indent=2)

def clear_pid_file():
    if PID_FILE.exists():
        try:
            PID_FILE.unlink()
        except Exception:
            pass

import socket

def check_port_listening(port):
    """Instant, non-blocking check if a local port is listening."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0

def seed_db():
    print("🌱 Initializing and seeding database...")
    try:
        subprocess.run([sys.executable, str(ROOT_DIR / "backend" / "seed.py")], cwd=str(ROOT_DIR), check=True)
        print("   Database schema and demo users verified.")
    except Exception as e:
        print(f"⚠️ Warning during database seed: {e}")

def stop():
    print("🛑 Stopping all Sankalp SSO services...")
    saved = load_saved_pids()
    killed_any = False

    # 1. Kill saved PIDs
    for name, pid in saved.items():
        if pid:
            print(f"   Terminating {name} (PID: {pid})...")
            kill_pid(pid)
            killed_any = True

    # 2. Kill any leftover processes on the required ports
    for name, port in PORTS.items():
        active_pids = get_pids_by_port(port)
        for pid in active_pids:
            print(f"   Freeing port {port} ({name}, PID: {pid})...")
            kill_pid(pid)
            killed_any = True

    clear_pid_file()
    time.sleep(1)
    print("✅ All services stopped successfully.")

def start(foreground=False):
    print("=" * 65)
    print("  🚀 Starting Sankalp SSO & Digital Identity System")
    print("=" * 65)

    # Make sure ports are free first
    for name, port in PORTS.items():
        if check_port_listening(port):
            print(f"⚠️ Port {port} ({name}) is already in use. Cleaning up...")
            for pid in get_pids_by_port(port):
                kill_pid(pid)
            time.sleep(0.5)

    ensure_log_dir()
    seed_db()

    backend_log = open(LOG_DIR / "backend.log", "a")
    frontend_log = open(LOG_DIR / "frontend.log", "a")
    demos_log = open(LOG_DIR / "demo-apps.log", "a")

    pids = {}

    # 1. Start Backend (FastAPI on 8001)
    print("⚡ Launching Backend (FastAPI) on http://localhost:8001...")
    p_backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"],
        cwd=str(ROOT_DIR / "backend"),
        stdout=backend_log,
        stderr=backend_log
    )
    pids["backend"] = p_backend.pid

    # 2. Start Demo Apps (Ports 5174 through 5178)
    print("⚡ Launching 5 Connected Campus Clubs (Ports 5174 through 5178)...")
    p_demos = subprocess.Popen(
        [sys.executable, "serve_demo_apps.py"],
        cwd=str(ROOT_DIR / "demo-apps"),
        stdout=demos_log,
        stderr=demos_log
    )
    pids["demos"] = p_demos.pid

    # 3. Start Frontend (Vite on 5180)
    print("⚡ Launching Central Login Portal (Vite) on http://localhost:5180...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    p_frontend = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(ROOT_DIR / "frontend"),
        stdout=frontend_log,
        stderr=frontend_log
    )
    pids["frontend"] = p_frontend.pid

    save_pids(pids)

    # Wait for services to be ready
    print("\n⏳ Verifying service availability...")
    all_ready = False
    for _ in range(15):
        time.sleep(1)
        b_up = check_port_listening(8001)
        f_up = check_port_listening(5180)
        d_up = check_port_listening(5174)
        if b_up and f_up and d_up:
            all_ready = True
            break

    print("=" * 65)
    if all_ready:
        print("  🎉 ALL SERVICES ONLINE & OPERATIONAL!")
    else:
        print("  ℹ️ Services started (initializing background workers)...")
    print("=" * 65)
    print("  • Central Login & Admin : http://localhost:5180")
    print("  • Backend API & Docs    : http://localhost:8001/docs")
    print("  • Demo App A (Photo)    : http://localhost:5174")
    print("  • Demo App B (Robotics) : http://localhost:5175")
    print("=" * 65)
    print("  Logs saved in : ./logs/")
    print("  Stop system   : python scripts/manager.py stop")
    print("  Restart system: python scripts/manager.py restart")
    print("=" * 65)

    if foreground:
        try:
            print("\nRunning in foreground. Press Ctrl+C to stop all services.\n")
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            stop()

def status():
    print("=" * 65)
    print("  📊 Sankalp SSO Service Status Board")
    print("=" * 65)
    saved = load_saved_pids()
    for name, port in PORTS.items():
        active = check_port_listening(port)
        pids = list(get_pids_by_port(port))
        status_str = "🟢 ONLINE" if active else "🔴 STOPPED"
        pid_str = f"(PID: {', '.join(map(str, pids))})" if pids else ""
        print(f"  {name:<26} Port {port:<5} : {status_str} {pid_str}")
    print("=" * 65)

def restart():
    print("🔄 Restarting Sankalp SSO System...")
    stop()
    time.sleep(1)
    start(foreground=False)

if __name__ == "__main__":
    action = sys.argv[1].lower() if len(sys.argv) > 1 else "start"

    if action in ["start", "up"]:
        foreground = "--fg" in sys.argv or "-f" in sys.argv
        start(foreground=foreground)
    elif action in ["stop", "down"]:
        stop()
    elif action in ["restart", "reload"]:
        restart()
    elif action in ["status", "ps"]:
        status()
    else:
        print("Usage: python scripts/manager.py [start|stop|restart|status] [--fg]")
        sys.exit(1)
