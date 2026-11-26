import email.utils
import html
import logging
import re
import smtplib
import ssl
import threading
from datetime import datetime, timedelta, timezone
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.config import (
    ADMIN_CONTACT_EMAIL,
    EMAIL_FROM,
    EMAIL_FROM_NAME,
    ORG_NAME,
    SMTP_HOST,
    SMTP_PASS,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
)

IST = timezone(timedelta(hours=5, minutes=30), name="IST")
logger = logging.getLogger("sankalp.email")

TEMPLATES_DIR = Path(__file__).parent.parent / "email_templates"
ASSETS_DIR = Path(__file__).parent.parent / "email_assets"
URL_CONTEXT_KEYS = {"reset_url", "invite_url", "review_url", "login_url", "renew_url", "assets_url"}


def get_ist_now_str() -> str:
    """Return formatted current Indian Standard Time (IST - UTC+05:30)."""
    return datetime.now(IST).strftime("%Y-%m-%d %I:%M:%S %p IST")


def to_ist_str(dt: Optional[datetime] = None) -> str:
    if dt is None:
        return get_ist_now_str()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).strftime("%Y-%m-%d %I:%M:%S %p IST")


def _clean_smtp_password() -> str:
    """Google App Passwords often contain spaces. Strip them safely."""
    return SMTP_PASS.replace(" ", "").strip() if SMTP_PASS else ""


def render_email_template(template_filename: str, context: Dict[str, Any]) -> Tuple[str, List[str]]:
    """
    Render an HTML email template with escaped dynamic placeholders and inline CID asset extraction.
    """
    template_path = TEMPLATES_DIR / template_filename
    if not template_path.exists():
        logger.warning("Email template not found at %s. Falling back to plain layout.", template_path)
        return "", []

    content = template_path.read_text(encoding="utf-8")
    ctx = {
        "org_name": ORG_NAME or "Sankalp SSO",
        "admin_name": "Campus Administrator",
        "admin_email": ADMIN_CONTACT_EMAIL or EMAIL_FROM or SMTP_USER or "admin@college.edu",
        "role": "Member",
        "expires_in": "48 hours",
        **context,
    }

    found_images = re.findall(r"\{\{\s*assets_url\s*\}\}/([a-zA-Z0-9_.-]+)", content)
    content = re.sub(r'src=["\']\{\{\s*assets_url\s*\}\}/([a-zA-Z0-9_.-]+)["\']', r'src="cid:\1"', content)

    def replacer(match: re.Match) -> str:
        expr = match.group(1).strip()
        is_upper = "|upper" in expr
        var_name = expr.split("|")[0].strip() if is_upper else expr
        raw_val = str(ctx.get(var_name, ""))
        if is_upper:
            raw_val = raw_val.upper()
        if var_name in URL_CONTEXT_KEYS:
            return html.escape(raw_val, quote=True)
        return html.escape(raw_val, quote=True)

    rendered = re.sub(r"\{\{\s*([a-zA-Z0-9_| ]+?)\s*\}\}", replacer, content)
    return rendered, list(set(found_images))


def send_email(
    to_email: str,
    subject: str,
    text_content: str,
    html_content: Optional[str] = None,
    inline_images: Optional[List[str]] = None,
) -> bool:
    """
    Send an email via configured SMTP server (STARTTLS/SSL) without logging secrets.
    """
    if not SMTP_HOST or not SMTP_USER:
        logger.warning(
            "SMTP is not configured (SMTP_HOST or SMTP_USER missing). Email to %s not sent via network.",
            to_email,
        )
        return False

    from_name = (EMAIL_FROM_NAME or "Sankalp SSO").strip('"\'').replace("_", " ")
    from_addr = SMTP_USER or EMAIL_FROM

    if inline_images and html_content:
        msg_root = MIMEMultipart("related")
        msg_root["Subject"] = subject
        msg_root["From"] = f"{from_name} <{from_addr}>"
        msg_root["To"] = to_email

        msg_alt = MIMEMultipart("alternative")
        msg_root.attach(msg_alt)
        msg_alt.attach(MIMEText(text_content, "plain", "utf-8"))
        msg_alt.attach(MIMEText(html_content, "html", "utf-8"))

        for img_name in inline_images:
            img_path = ASSETS_DIR / img_name
            if img_path.exists():
                try:
                    with open(img_path, "rb") as f:
                        img_mime = MIMEImage(f.read())
                        img_mime.add_header("Content-ID", f"<{img_name}>")
                        img_mime.add_header("Content-Disposition", "inline", filename=img_name)
                        msg_root.attach(img_mime)
                except Exception as ex:
                    logger.warning("Could not attach inline asset %s: %s", img_name, ex)
        msg_to_send = msg_root
    else:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_addr}>"
        msg["To"] = to_email
        msg.attach(MIMEText(text_content, "plain", "utf-8"))
        if html_content:
            msg.attach(MIMEText(html_content, "html", "utf-8"))
        msg_to_send = msg

    msg_to_send["Reply-To"] = from_addr
    msg_to_send["Date"] = email.utils.formatdate(localtime=True)
    msg_to_send["Message-ID"] = email.utils.make_msgid(
        domain=from_addr.split("@")[-1] if "@" in from_addr else "gmail.com"
    )
    msg_to_send["X-Mailer"] = "Sankalp SSO Security Gateway"

    clean_pass = _clean_smtp_password()
    try:
        if SMTP_SECURE == "ssl" or SMTP_PORT == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=15) as server:
                if SMTP_USER and clean_pass:
                    server.login(SMTP_USER, clean_pass)
                server.send_message(msg_to_send)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.ehlo()
                if SMTP_SECURE in ["tls", "starttls"] or SMTP_PORT == 587:
                    context = ssl.create_default_context()
                    server.starttls(context=context)
                    server.ehlo()
                if SMTP_USER and clean_pass:
                    server.login(SMTP_USER, clean_pass)
                server.send_message(msg_to_send)
        logger.info("Successfully sent email to %s (Subject: %s)", to_email, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, str(exc))
        return False


def _dispatch_in_background(
    to_email: str,
    subject: str,
    text_content: str,
    html_content: Optional[str],
    inline_images: Optional[List[str]] = None,
) -> bool:
    thread = threading.Thread(
        target=send_email,
        args=(to_email, subject, text_content, html_content, inline_images),
        daemon=True,
    )
    thread.start()
    logger.info("Dispatched background email to %s (Subject: %s)", to_email, subject)
    return True


# Re-export modular template functions for full backward compatibility
from app.services.email_auth_templates import (  # noqa: E402, F401
    build_invite_email,
    build_password_changed_email,
    build_password_reset_email,
    send_application_approved_email,
    send_application_rejected_email,
    send_application_submitted_emails,
    send_disable_face_lock_otp_email,
    send_invite_email,
    send_login_alert_email,
    send_password_changed_email,
    send_password_reset_email,
)
from app.services.email_lifecycle_templates import (  # noqa: E402, F401
    build_expired_email,
    build_final_purge_takeout_email,
    build_mark_as_left_email,
    build_renewal_status_email,
    send_account_expired_email,
    send_expired_email,
    send_expiry_warning_email,
    send_final_purge_takeout_email,
    send_mark_as_left_email,
    send_marked_as_left_email,
    send_renewal_status_email,
)
