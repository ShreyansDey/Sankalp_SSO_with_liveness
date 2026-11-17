import subprocess
import sys
import time
from pathlib import Path

root_dir = Path(__file__).resolve().parent

def main():
    print("=" * 65)
    print("  🚀 Sankalp SSO & Digital Identity: Starting Local Environment")
    print("=" * 65)
    print("  [1/3] Backend API Server   --> http://localhost:8000")
    print("  [2/3] Central Login (Vite) --> http://localhost:5173")
    print("  [3/3] Demo Apps (A & B)    --> http://localhost:5174 & 5175")
    print("=" * 65)

    processes = []
    try:
        # 1. Seed database first
        print("🌱 Checking and seeding database...")
        subprocess.run([sys.executable, "backend/seed.py"], cwd=root_dir, check=True)

        # 2. Start backend
        print("⚡ Launching FastAPI backend...")
        p_backend = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"],
            cwd=root_dir / "backend"
        )
        processes.append(p_backend)

        # 3. Start demo apps
        print("⚡ Launching Demo Apps A & B...")
        p_demos = subprocess.Popen(
            [sys.executable, "serve_demo_apps.py"],
            cwd=root_dir / "demo-apps"
        )
        processes.append(p_demos)

        # 4. Start frontend
        print("⚡ Launching Vite Frontend on port 5173...")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        p_frontend = subprocess.Popen(
            [npm_cmd, "run", "dev"],
            cwd=root_dir / "frontend"
        )
        processes.append(p_frontend)

        print("\n✨ All services running! Open http://localhost:5174 (App A) to test the flow.")
        print("Press Ctrl+C to terminate all services.\n")

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n🛑 Shutting down all processes...")
    finally:
        for p in processes:
            p.terminate()
        print("✅ Shutdown complete.")

if __name__ == "__main__":
    main()
