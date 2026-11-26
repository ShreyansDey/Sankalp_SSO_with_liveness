import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import (
    ALLOW_TUNNEL_ORIGINS,
    APP_A_ORIGIN,
    APP_B_ORIGIN,
    APP_C_ORIGIN,
    APP_D_ORIGIN,
    APP_E_ORIGIN,
    BOOTSTRAP_PASSWORD,
    BOOTSTRAP_USERNAME,
    CORS_ORIGINS,
    FRONTEND_ORIGIN,
    IS_PRODUCTION,
    SUPERUSER_CREATION_KEY,
)
from app.database import SessionLocal
from app.jobs.cleanup import run_cleanup_job
from app.middleware.security import SecurityHeadersMiddleware
from app.models import SystemBootstrap
from app.routes import admin, auth, integrations, liveness, reports, setup, sso
from app.security import hash_password
from app.services.face_engine import is_face_engine_ready

logger = logging.getLogger("sankalp.main")


async def _periodic_cleanup_loop():
    """Run lifecycle cleanup every 15 minutes in background."""
    while True:
        try:
            await asyncio.to_thread(run_cleanup_job)
        except Exception as exc:
            logger.error("Background cleanup error: %s", exc)
        await asyncio.sleep(900)


def _seed_bootstrap_from_env():
    """If SUPERUSER_CREATION_KEY is set via environment, seed initial uncompleted bootstrap record safely."""
    if not SUPERUSER_CREATION_KEY:
        return
    db = SessionLocal()
    try:
        existing = db.query(SystemBootstrap).filter(SystemBootstrap.id == "singleton").first()
        if not existing:
            boot = SystemBootstrap(
                id="singleton",
                primary_key_hash=hash_password(SUPERUSER_CREATION_KEY),
                bootstrap_username=BOOTSTRAP_USERNAME or None,
                bootstrap_password_hash=hash_password(BOOTSTRAP_PASSWORD) if BOOTSTRAP_PASSWORD else None,
                setup_completed=False,
            )
            db.add(boot)
            db.commit()
    except Exception as exc:
        logger.warning("Bootstrap env sync skipped: %s", exc)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _seed_bootstrap_from_env()
    cleanup_task = None
    in_pytest = "PYTEST_CURRENT_TEST" in os.environ
    if not in_pytest and os.getenv("DISABLE_BACKGROUND_CLEANUP", "false").lower() != "true":
        cleanup_task = asyncio.create_task(_periodic_cleanup_loop())
    try:
        yield
    finally:
        if cleanup_task:
            cleanup_task.cancel()


app = FastAPI(
    title="Sankalp SSO — Real Person, Real Access",
    description="Self-hosted SSO with Active Physical Liveness, Biometric Face Lock, Automatic Lifecycle Cleanup & Universal Integration API.",
    version="2.0.0",
    lifespan=lifespan,
)


@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

# Explicit strict CORS origin allowlist (no wildcard https?://.*)
allowed_origins = {
    FRONTEND_ORIGIN.rstrip("/"),
    APP_A_ORIGIN.rstrip("/"),
    APP_B_ORIGIN.rstrip("/"),
    APP_C_ORIGIN.rstrip("/"),
    APP_D_ORIGIN.rstrip("/"),
    APP_E_ORIGIN.rstrip("/"),
    *CORS_ORIGINS,
}
if not IS_PRODUCTION:
    allowed_origins.update(
        {
            "http://localhost:5173",
            "http://localhost:5180",
            "http://127.0.0.1:5180",
            "http://localhost:5174",
            "http://localhost:5175",
            "http://localhost:5176",
            "http://localhost:5177",
            "http://localhost:5178",
        }
    )

cors_kwargs = {
    "allow_origins": sorted(o for o in allowed_origins if o),
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if ALLOW_TUNNEL_ORIGINS:
    cors_kwargs["allow_origin_regex"] = r"^https://[a-zA-Z0-9-]+\.(ngrok-free\.app|ngrok\.io|trycloudflare\.com)$"

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CORSMiddleware, **cors_kwargs)

app.include_router(auth.router)
app.include_router(liveness.router)
app.include_router(sso.router)
app.include_router(admin.router)
app.include_router(setup.router)
app.include_router(integrations.router)
app.include_router(reports.router)


@app.get("/")
def root():
    return {
        "name": "Sankalp SSO — Real Person, Real Access",
        "version": "2.0.0",
        "status": "healthy",
        "discovery": "/.well-known/openid-configuration",
        "integration_api": "/api/v1/integrations/discovery",
    }


@app.get("/health")
def health():
    db_ok = False
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    finally:
        db.close()

    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "error",
        "face_engine_ready": is_face_engine_ready(),
        "environment": "production" if IS_PRODUCTION else "development",
    }
