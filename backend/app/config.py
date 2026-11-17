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

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sankalp.db")
JWT_SECRET = os.getenv("JWT_SECRET", "sankalp-dev-super-secret-key-change-in-production-must-be-long-and-random-32bytes")
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "10"))
SSO_SESSION_HOURS = int(os.getenv("SSO_SESSION_HOURS", "8"))
INACTIVITY_DAYS = int(os.getenv("INACTIVITY_DAYS", "60"))

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
APP_A_ORIGIN = os.getenv("APP_A_ORIGIN", "http://localhost:5174")
APP_B_ORIGIN = os.getenv("APP_B_ORIGIN", "http://localhost:5175")

# Environment indicator
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"
