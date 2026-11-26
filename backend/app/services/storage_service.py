import base64
import uuid
from pathlib import Path
from typing import Optional, Tuple
from app.config import UPLOAD_DIR

MAX_PORTRAIT_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024  # 10 MB

ALLOWED_IMAGE_SIGNATURES = (
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
)


def _detect_mime_and_ext(raw_bytes: bytes, allow_pdf: bool = False) -> Tuple[Optional[str], Optional[str]]:
    """Inspect magic bytes so spoofed MIME headers cannot bypass upload validation."""
    if not raw_bytes or len(raw_bytes) < 4:
        return None, None
    for sig, ext, mime in ALLOWED_IMAGE_SIGNATURES:
        if raw_bytes.startswith(sig):
            return mime, ext
    if len(raw_bytes) >= 12 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
        return "image/webp", "webp"
    if allow_pdf and raw_bytes.startswith(b"%PDF-"):
        return "application/pdf", "pdf"
    return None, None


def decode_and_validate_base64(
    payload: str,
    allow_pdf: bool = False,
    max_bytes: int = MAX_PORTRAIT_BYTES,
) -> Tuple[bytes, str, str]:
    """
    Decode base64/data-URI upload, enforce byte size limit, and verify magic bytes.
    Raises ValueError on malformed, oversized, or disallowed file content.
    """
    if not payload or not isinstance(payload, str):
        raise ValueError("Empty upload payload")

    b64_data = payload.split(",", 1)[1] if "," in payload else payload
    b64_data = b64_data.strip()

    # Quick pre-check before decoding full string to bound memory allocation
    estimated_bytes = (len(b64_data) * 3) // 4
    if estimated_bytes > max_bytes + 1024:
        raise ValueError(f"Uploaded file exceeds maximum allowed size of {max_bytes // (1024 * 1024)} MB")

    try:
        raw_bytes = base64.b64decode(b64_data, validate=False)
    except Exception as exc:
        raise ValueError("Invalid base64 encoding") from exc

    if len(raw_bytes) > max_bytes:
        raise ValueError(f"Uploaded file exceeds maximum allowed size of {max_bytes // (1024 * 1024)} MB")

    mime, ext = _detect_mime_and_ext(raw_bytes, allow_pdf=allow_pdf)
    if not mime or not ext:
        allowed = "JPEG, PNG, WEBP, or PDF" if allow_pdf else "JPEG, PNG, or WEBP"
        raise ValueError(f"Unsupported or invalid file signature. Allowed formats: {allowed}")

    return raw_bytes, mime, ext


def save_user_file(user_id: str, category: str, raw_bytes: bytes, ext: str) -> str:
    """Safely save validated bytes under UPLOAD_DIR/<category>/ with path traversal guard."""
    safe_category = "documents" if category == "documents" else "faces"
    target_dir = (UPLOAD_DIR / safe_category).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    safe_uid = "".join(c for c in str(user_id) if c.isalnum() or c in ("-", "_"))[:36] or "user"
    safe_ext = "".join(c for c in ext.lower() if c.isalnum())[:10] or "bin"
    file_path = (target_dir / f"{safe_uid}_{uuid.uuid4().hex[:8]}.{safe_ext}").resolve()

    if not str(file_path).startswith(str(target_dir)):
        raise ValueError("Invalid upload destination path")

    file_path.write_bytes(raw_bytes)
    return str(file_path)


def read_safe_upload_as_data_uri(path_str: Optional[str]) -> Optional[str]:
    """Read an existing upload within UPLOAD_DIR and return a safe base64 data URI."""
    if not path_str:
        return None
    try:
        p = Path(path_str).resolve()
        if not str(p).startswith(str(UPLOAD_DIR)) or not p.is_file():
            return None
        data = p.read_bytes()
        mime, _ = _detect_mime_and_ext(data, allow_pdf=True)
        mime = mime or "application/octet-stream"
        encoded = base64.b64encode(data).decode("ascii")
        return f"data:{mime};base64,{encoded}"
    except Exception:
        return None


def erase_user_files(*paths: Optional[str]) -> int:
    """Permanently unlink local e-KYC document/photo files (DPDP data reduction). Returns deleted count."""
    removed = 0
    for path_str in paths:
        if not path_str:
            continue
        try:
            p = Path(path_str).resolve()
            if str(p).startswith(str(UPLOAD_DIR)) and p.is_file():
                p.unlink(missing_ok=True)
                removed += 1
        except Exception:
            pass
    return removed
