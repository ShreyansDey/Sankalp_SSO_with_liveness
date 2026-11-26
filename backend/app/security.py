import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from app.config import JWT_SECRET, ACCESS_TOKEN_MINUTES, LOGIN_TICKET_TTL_SECONDS

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
    if not plain_password or not hashed_password:
        return False
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError):
        return False


def hash_token(token: str) -> str:
    """
    Hash a secret token (one-time code, refresh token, invite token, client secret, API key)
    using SHA-256 for secure, deterministic lookup.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def constant_time_compare(val_a: str, val_b: str) -> bool:
    """Compare two strings in constant time to prevent timing side-channel leaks."""
    if val_a is None or val_b is None:
        return False
    return secrets.compare_digest(val_a.encode("utf-8"), val_b.encode("utf-8"))


def generate_random_token(length: int = 32) -> str:
    """Generate a cryptographically secure URL-safe random string."""
    return secrets.token_urlsafe(length)


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate a prefixed Sankalp API key (sk_live_<random>).
    Returns (plaintext_key, key_prefix, sha256_key_hash).
    """
    raw = secrets.token_urlsafe(32)
    full_key = f"sk_live_{raw}"
    prefix = full_key[:16]
    return full_key, prefix, hash_token(full_key)


def generate_liveness_code() -> str:
    """Generate a short 8-character one-time code for liveness."""
    return secrets.token_hex(4).upper()


def create_access_token(user_id: str, email: str, role: str) -> str:
    """
    Create a signed JWT access token valid for ACCESS_TOKEN_MINUTES (per srs.md FR4).
    Contains sub (user_id), email, role, type, and jti (unique token id).
    """
    now = datetime.utcnow()
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "token_use": "access",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify a signed JWT access token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("token_use") not in (None, "access"):
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def create_signed_ticket(
    user_id: str,
    purpose: str = "liveness",
    ttl_seconds: int = LOGIN_TICKET_TTL_SECONDS,
) -> str:
    """Create a short-lived signed JWT proof ticket binding a verified credential step to liveness."""
    now = datetime.utcnow()
    payload = {
        "sub": user_id,
        "purpose": purpose,
        "token_use": "ticket",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_signed_ticket(token: str, expected_purpose: str = "liveness") -> Optional[Dict[str, Any]]:
    """Verify a short-lived signed ticket and ensure its purpose matches."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("token_use") != "ticket" or payload.get("purpose") != expected_purpose:
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def compute_pkce_s256(code_verifier: str) -> str:
    """Compute base64url(SHA256(code_verifier)) without padding per RFC 7636."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def verify_pkce(code_challenge: str, code_challenge_method: Optional[str], code_verifier: Optional[str]) -> bool:
    """Verify PKCE S256 (or plain if explicitly chosen in legacy dev) challenge."""
    if not code_verifier:
        return False
    method = (code_challenge_method or "S256").upper()
    if method == "S256":
        expected = compute_pkce_s256(code_verifier)
        return constant_time_compare(expected, code_challenge)
    if method == "PLAIN":
        return constant_time_compare(code_verifier, code_challenge)
    return False
