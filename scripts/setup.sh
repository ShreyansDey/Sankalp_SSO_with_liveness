#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "=========================================================="
echo "  🛠️  Sankalp SSO System Environment Setup"
echo "=========================================================="

# 1. Check Python
echo -e "\n[1/4] Checking Python environment..."
if [ -f "$ROOT_DIR/venv/bin/python" ]; then
    PYTHON_CMD="$ROOT_DIR/venv/bin/python"
elif [ -f "$ROOT_DIR/san_venv/bin/python" ]; then
    PYTHON_CMD="$ROOT_DIR/san_venv/bin/python"
elif [ -f "$ROOT_DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$ROOT_DIR/.venv/bin/python"
elif [ -f "$ROOT_DIR/backend/.venv/bin/python" ]; then
    PYTHON_CMD="$ROOT_DIR/backend/.venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python is not installed or not in PATH."
    exit 1
fi
echo "   Detected: $($PYTHON_CMD --version)"

# 2. Install Python dependencies
echo -e "\n[2/4] Installing / verifying backend Python dependencies..."
$PYTHON_CMD -m pip install -r backend/requirements.txt --quiet
echo "   ✅ Python dependencies installed."

# 3. Check Node & npm
echo -e "\n[3/4] Checking Node.js & installing frontend dependencies..."
if ! command -v npm &>/dev/null; then
    echo "❌ npm not found! Please install Node.js."
    exit 1
fi
echo "   Detected Node.js: $(node --version)"
(cd "$ROOT_DIR/frontend" && npm install --quiet)
echo "   ✅ Frontend dependencies installed."

# 4. Seed Database
echo -e "\n[4/4] Seeding database schema and demo accounts..."
$PYTHON_CMD "$ROOT_DIR/backend/seed.py"

echo -e "\n=========================================================="
echo "  🎉 System setup complete and ready to run!"
echo "=========================================================="
echo "  To launch the whole setup, run:"
echo "    ./scripts/start.sh"
echo "=========================================================="
