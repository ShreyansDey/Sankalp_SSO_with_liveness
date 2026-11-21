#!/bin/sh
set -e

# Run production or development database initialization
if [ "$ENVIRONMENT" = "production" ]; then
    echo "Running in PRODUCTION mode..."
    if [ "$BOOTSTRAP_PROD" = "true" ]; then
        echo "Executing clean production bootstrap (0 demo users)..."
        python init_prod.py
    fi
    # In production, use single worker or configured count without fork overload
    WORKERS_COUNT="${WORKERS:-1}"
    if [ "$WORKERS_COUNT" -gt 1 ] 2>/dev/null; then
        exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "$WORKERS_COUNT" --proxy-headers
    else
        exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
    fi
else
    echo "Running in DEVELOPMENT mode..."
    if [ "$SEED_DB" = "true" ] || [ ! -f "/app/sankalp.db" ]; then
        python seed.py || true
    fi
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
