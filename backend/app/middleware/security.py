import threading
import time
from collections import defaultdict, deque
from typing import Tuple
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import RATE_LIMIT_ENABLED, IS_PRODUCTION


class InMemoryRateLimiter:
    """Thread-safe sliding-window rate limiter keyed by client IP and route bucket."""

    def __init__(self):
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def reset(self):
        with self._lock:
            self._hits.clear()

    def allow(self, key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(bucket[0] + window_seconds - now))
                return False, retry_after
            bucket.append(now)
            return True, 0


rate_limiter = InMemoryRateLimiter()

# Endpoint buckets: (path_prefix, max_requests, window_seconds)
RATE_LIMIT_RULES = [
    ("/auth/login", 30, 60),
    ("/auth/forgot-password", 10, 60),
    ("/auth/reset-password", 15, 60),
    ("/liveness/challenge", 40, 60),
    ("/liveness/result", 40, 60),
    ("/admin/disable-face-lock/request-otp", 10, 60),
    ("/api/v1/setup/bootstrap-superuser", 15, 60),
]


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add defensive HTTP security headers and enforce per-endpoint sliding-window rate limits."""

    async def dispatch(self, request: Request, call_next):
        if RATE_LIMIT_ENABLED and request.method in {"POST", "PUT", "DELETE"}:
            path = request.url.path
            client_host = request.client.host if request.client else "unknown"
            for prefix, limit, window in RATE_LIMIT_RULES:
                if path.startswith(prefix):
                    allowed, retry_after = rate_limiter.allow(
                        f"{client_host}:{prefix}", limit, window
                    )
                    if not allowed:
                        return JSONResponse(
                            status_code=429,
                            content={
                                "error": "rate_limited",
                                "message": f"Too many requests. Retry in {retry_after} seconds.",
                            },
                            headers={"Retry-After": str(retry_after)},
                        )
                    break

        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-XSS-Protection", "1; mode=block")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(self), microphone=(), geolocation=()",
        )
        if IS_PRODUCTION:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response
