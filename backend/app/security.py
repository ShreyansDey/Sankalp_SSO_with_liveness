import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from app.config import JWT_SECRET, ACCESS_TOKEN_MINUTES, SSO_SESSION_HOURS

# Argon2 password hasher
ph = PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    salt_len=16
)

def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2."""
    return ph.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against an Argon2 hash."""
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError):
        return False

def hash_token(token: str) -> str:
    """
    Hash a secret token (one-time code, refresh token, invite token, client secret)
    using SHA-256 for secure, deterministic lookup.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def generate_random_token(length: int = 32) -> str:
    """Generate a cryptographically secure URL-safe random string."""
    return secrets.token_urlsafe(length)

def generate_liveness_code() -> str:
    """Generate a short 6-8 character one-time code for liveness."""
    return secrets.token_hex(4).upper()

def create_access_token(user_id: str, email: str, role: str) -> str:
    """
    Create a signed JWT access token valid for 10 minutes (per srs.md FR4).
    Contains sub (user_id), email, role, and jti (unique token id).
    """
    now = datetime.utcnow()
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify a signed JWT access token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
