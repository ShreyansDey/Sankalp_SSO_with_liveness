import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from root or backend directory
base_dir = Path(__file__).resolve().parent.parent
root_env = base_dir.parent / ".env"
backend_env = base_dir / ".env"

if root_env.exists():
    load_dotenv(root_env, override=True)
elif backend_env.exists():
    load_dotenv(backend_env, override=True)
else:
    load_dotenv(override=True)

raw_db = os.getenv("DATABASE_URL", "sqlite:///./sankalp.db")
if raw_db.startswith("sqlite:///./"):
    db_filename = raw_db[len("sqlite:///./"):]
    canonical_db = (base_dir.parent / db_filename).resolve().as_posix()
    DATABASE_URL = f"sqlite:///{canonical_db}"
elif raw_db == "sqlite:///sankalp.db":
    canonical_db = (base_dir.parent / "sankalp.db").resolve().as_posix()
    DATABASE_URL = f"sqlite:///{canonical_db}"
elif raw_db.startswith("postgresql://"):
    DATABASE_URL = raw_db.replace("postgresql://", "postgresql+psycopg2://", 1)
else:
    DATABASE_URL = raw_db
JWT_SECRET = os.getenv("JWT_SECRET", "sankalp-dev-super-secret-key-change-in-production-must-be-long-and-random-32bytes")
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "10"))
SSO_SESSION_HOURS = int(os.getenv("SSO_SESSION_HOURS", "8"))
INACTIVITY_DAYS = int(os.getenv("INACTIVITY_DAYS", "60"))
PURGE_GRACE_HOURS = int(os.getenv("PURGE_GRACE_HOURS", "48"))

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5180")
APP_A_ORIGIN = os.getenv("APP_A_ORIGIN", "http://localhost:5174")
APP_B_ORIGIN = os.getenv("APP_B_ORIGIN", "http://localhost:5175")
APP_C_ORIGIN = os.getenv("APP_C_ORIGIN", "http://localhost:5176")
APP_D_ORIGIN = os.getenv("APP_D_ORIGIN", "http://localhost:5177")
APP_E_ORIGIN = os.getenv("APP_E_ORIGIN", "http://localhost:5178")

# Environment indicator
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

def resolve_frontend_origin(request=None) -> str:
    """
    Dynamically resolve the frontend origin based on incoming request headers.
    Ensures invite and reset links generated via public tunnels (ngrok, etc.)
    open correctly on remote mobile devices and other laptops.
    """
    if request:
        origin = request.headers.get("origin")
        if origin and origin != "null":
            return origin.rstrip("/")
        referer = request.headers.get("referer")
        if referer:
            from urllib.parse import urlparse
            p = urlparse(referer)
            if p.scheme and p.netloc:
                return f"{p.scheme}://{p.netloc}".rstrip("/")
        forwarded_host = request.headers.get("x-forwarded-host")
        if forwarded_host:
            proto = request.headers.get("x-forwarded-proto") or ("https" if "ngrok" in forwarded_host else "http")
            return f"{proto}://{forwarded_host}".rstrip("/")
        host = request.headers.get("host")
        if host and ("ngrok" in host or "trycloudflare" in host):
            proto = "https"
            return f"{proto}://{host}".rstrip("/")
    return FRONTEND_ORIGIN.rstrip("/")

# SMTP & Email Settings
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_SECURE = os.getenv("SMTP_SECURE", "tls").lower()
EMAIL_FROM = os.getenv("EMAIL_FROM", SMTP_USER or "noreply@sankalp.edu")
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Real Access (Sankalp SSO)")
