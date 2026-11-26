import hashlib
from pathlib import Path
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from app.config import REPORTS_DIR

router = APIRouter(prefix="/api/v1/reports", tags=["Immutable Audit & Stress Reports"])
ALLOWED_EXTENSIONS = {".md", ".html", ".json", ".sha256"}


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


@router.get("")
def list_reports():
    """List immutable system audit and stress-test reports with live SHA-256 verification."""
    if not REPORTS_DIR.exists():
        return {"reports": [], "reports_dir": str(REPORTS_DIR)}

    items = []
    for p in sorted(REPORTS_DIR.iterdir()):
        if not p.is_file() or p.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        items.append(
            {
                "filename": p.name,
                "format": p.suffix.lstrip(".").lower(),
                "size_bytes": p.stat().st_size,
                "sha256": _sha256_file(p),
                "download_url": f"/api/v1/reports/{p.name}/download",
            }
        )
    return {"reports": items}


@router.get("/{filename}/download")
def download_report(filename: str):
    """Stream an immutable report file with Content-Disposition attachment and SHA-256 header."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "invalid_filename"})
    target = (REPORTS_DIR / filename).resolve()
    if not str(target).startswith(str(REPORTS_DIR)) or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "report_not_found"})
    if target.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "unsupported_format"})

    media_map = {
        ".md": "text/markdown; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".sha256": "text/plain; charset=utf-8",
    }
    sha256 = _sha256_file(target)
    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type=media_map.get(target.suffix.lower(), "application/octet-stream"),
        headers={"X-Report-SHA256": sha256},
    )
