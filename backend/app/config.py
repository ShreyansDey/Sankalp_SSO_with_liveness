import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend root or current directory
base_dir = Path(__file__).resolve().parent.parent
env_file = base_dir / ".env"
if env_file.exists():
    load_dotenv(env_file)
else:
    load_dotenv()

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

# Environment indicator
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

# SMTP & Email Settings
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_SECURE = os.getenv("SMTP_SECURE", "tls").lower()
EMAIL_FROM = os.getenv("EMAIL_FROM", SMTP_USER or "noreply@sankalp.edu")
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Real Access (Sankalp SSO)")
