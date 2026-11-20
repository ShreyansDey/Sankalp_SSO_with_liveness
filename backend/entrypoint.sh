#!/bin/sh
set -e

# Run production or development database initialization
if [ "$ENVIRONMENT" = "production" ]; then
    echo "Running in PRODUCTION mode..."
    if [ "$BOOTSTRAP_PROD" = "true" ]; then
        echo "Executing clean production bootstrap (0 demo users)..."
        python init_prod.py
    fi
    # In production, use multiple workers and proxy headers
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${WORKERS:-4}" --proxy-headers
else
    echo "Running in DEVELOPMENT mode..."
    if [ "$SEED_DB" = "true" ] || [ ! -f "/app/sankalp.db" ]; then
        python seed.py || true
    fi
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
