#!/usr/bin/env bash
# Start Sankalp SSO Services
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

python3 scripts/manager.py start "$@"
