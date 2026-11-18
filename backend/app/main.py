import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.config import FRONTEND_ORIGIN, APP_A_ORIGIN, APP_B_ORIGIN
from app.database import engine, Base, SessionLocal, get_db
from app.routes import auth, liveness, sso, admin
from app.jobs.cleanup import run_cleanup_job

# Set up logging (never log sensitive tokens or passwords)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("sankalp.auth")

scheduler = BackgroundScheduler()

def scheduled_cleanup():
    logger.info("Executing daily automated cleanup job...")
    db = SessionLocal()
    try:
        res = run_cleanup_job(db)
        logger.info("Scheduled cleanup complete: %s", res)
    except Exception as e:
        logger.error("Error running cleanup job: %s", e)
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist
    logger.info("Creating database tables if not existing...")
    Base.metadata.create_all(bind=engine)

    # Schedule daily cleanup only in non-testing mode
    enable_scheduler = os.getenv("ENABLE_SCHEDULER", "true").lower() == "true"
    if enable_scheduler and not scheduler.running:
        try:
            scheduler.add_job(scheduled_cleanup, "interval", hours=24, id="daily_cleanup", replace_existing=True)
            scheduler.start()
            logger.info("APScheduler background cleanup job registered.")
        except Exception as e:
            logger.warning(f"Could not start scheduler: {e}")

    yield

    # Shutdown
    if scheduler.running:
        scheduler.shutdown(wait=False)
    logger.info("Application shutdown complete.")

app = FastAPI(
    title="Sankalp SSO & Digital Identity",
    description="Real Person, Real Access - Self-hosted SSO with in-browser liveness and automatic lifecycle cleanup",
    version="1.0.0",
    lifespan=lifespan
)

# ==============================================================================
# Cross-Origin Resource Sharing (CORS) Configuration
# In plain words: Web browsers block JavaScript from one website/port talking to
# another website/port unless explicitly permitted. Here we allow the Central
# Login portal (5173) and our 5 Connected Campus Clubs (5174 through 5178) to
# communicate securely with this authentication server.
# ==============================================================================
allowed_origins = [
    FRONTEND_ORIGIN,
    # 5 Connected University Clubs:
    "http://localhost:5174", "http://127.0.0.1:5174",  # Club 1: Photography Club
    "http://localhost:5175", "http://127.0.0.1:5175",  # Club 2: Robotics Lab
    "http://localhost:5176", "http://127.0.0.1:5176",  # Club 3: Coding & AI Club
    "http://localhost:5177", "http://127.0.0.1:5177",  # Club 4: Chess & Mind Sports
    "http://localhost:5178", "http://127.0.0.1:5178",  # Club 5: Athletics & Sports
    "http://localhost:8000", "http://127.0.0.1:8000"   # Backend API
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,  # Crucial: allows HttpOnly session cookies to be sent across origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers matching api.md standard: { "error": "short_code", "message": "plain words" }
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "http_error", "message": str(exc.detail)}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    first_error = exc.errors()[0] if exc.errors() else {}
    msg = first_error.get("msg", "Invalid request parameters")
    field = ".".join(str(loc) for loc in first_error.get("loc", []))
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": "validation_error", "message": f"{field}: {msg}"}
    )

# Include routes
app.include_router(auth.router)
app.include_router(liveness.router)
app.include_router(sso.router)
app.include_router(admin.router)

@app.get("/me")
def get_me_alias(request: Request, db: Session = Depends(get_db)):
    """Direct /me endpoint defined in docs/specs/api.md."""
    return auth.get_me(request=request, db=db)

@app.get("/")
@app.get("/health")
def health_check():
    """Healthcheck and system status."""
    return {
        "system": "Sankalp Real Person, Real Access SSO",
        "status": "healthy",
        "version": "1.0.0",
        "database": "connected"
    }
