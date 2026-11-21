import os
import re
import smtplib
import ssl
import logging
import threading
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from typing import Optional, Tuple, List, Dict, Any

from app.config import (
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE,
    EMAIL_FROM,
    EMAIL_FROM_NAME,
    FRONTEND_ORIGIN
)

logger = logging.getLogger("sankalp.email")

TEMPLATES_DIR = Path(__file__).parent.parent / "email_templates"
ASSETS_DIR = Path(__file__).parent.parent / "email_assets"


def _clean_smtp_password() -> str:
    """Google App Passwords often contain spaces (e.g. 'xxxx yyyy zzzz wwww'). Strip them."""
    return SMTP_PASS.replace(" ", "").strip() if SMTP_PASS else ""


def render_email_template(template_filename: str, context: Dict[str, Any]) -> Tuple[str, List[str]]:
    """
    Renders an HTML email template with dynamic placeholder replacement.
    Supports {{ variable }} and {{ variable|upper }}.
    Converts {{ assets_url }}/<asset_name> to cid:<asset_name> for RFC 2387 inline embedding.
    Returns (rendered_html, list_of_referenced_image_filenames).
    """
    template_path = TEMPLATES_DIR / template_filename
    if not template_path.exists():
        logger.warning("Email template not found at %s. Falling back to default layout.", template_path)
        return "", []

    content = template_path.read_text(encoding="utf-8")

    # Supply default context variables if missing
    ctx = {
        "org_name": "Jadavpur University Clubs",
        "admin_name": "Campus Administrator",
        "admin_email": EMAIL_FROM or SMTP_USER or "admin@college.edu",
        "role": "Member",
        "expires_in": "48 hours",
        **context
    }

    # Extract all asset image references before placeholder substitution
    found_images = re.findall(r'\{\{\s*assets_url\s*\}\}/([a-zA-Z0-9_.-]+)', content)

    # Standardize image sources to cid:<asset_name> for bulletproof email client rendering
    content = re.sub(r'src=["\']\{\{\s*assets_url\s*\}\}/([a-zA-Z0-9_.-]+)["\']', r'src="cid:\1"', content)

    # Regex replacer for {{ key }} and {{ key|upper }}
    def replacer(match: re.Match) -> str:
        expr = match.group(1).strip()
        if "|upper" in expr:
            var_name = expr.split("|")[0].strip()
            return str(ctx.get(var_name, "")).upper()
        return str(ctx.get(expr, ""))

    rendered = re.sub(r"\{\{\s*([a-zA-Z0-9_| ]+?)\s*\}\}", replacer, content)
    return rendered, list(set(found_images))


def send_email(
    to_email: str,
    subject: str,
    text_content: str,
    html_content: Optional[str] = None,
    inline_images: Optional[List[str]] = None
) -> bool:
    """
    Send an email via configured SMTP server (Gmail, institutional SMTP, etc.).
    Supports RFC 2387 multipart/related with inline CID images.
    Supports STARTTLS (port 587) and SSL (port 465).
    Never logs email passwords or tokens.
    """
    if not SMTP_HOST or not SMTP_USER:
        logger.warning(
            "SMTP is not configured (SMTP_HOST or SMTP_USER missing). Email to %s not sent via network.",
            to_email
        )
        return False

    from_name = EMAIL_FROM_NAME or "Real Access (Sankalp SSO)"
    from_addr = EMAIL_FROM or SMTP_USER

    # When inline images are present, wrap in multipart/related -> multipart/alternative
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

    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, str(e))
        return False


def _dispatch_in_background(
    to_email: str,
    subject: str,
    text_content: str,
    html_content: Optional[str],
    inline_images: Optional[List[str]] = None
) -> bool:
    """Helper to dispatch email in a detached daemon thread."""
    thread = threading.Thread(
        target=send_email,
        args=(to_email, subject, text_content, html_content, inline_images),
        daemon=True
    )
    thread.start()
    return True


# ==============================================================================
# 1. PASSWORD RESET
# ==============================================================================

def build_password_reset_email(name: str, reset_link: str, reset_token: str) -> Tuple[str, str, List[str]]:
    greeting_name = name.strip() if name and name.strip() else "Member"
    text_content = f"""Hello {greeting_name},

We received a request to reset your password for your Real Access account.

To reset your password, open the following link:
{reset_link}

Verification Token:
{reset_token}

Security Note:
- This reset link and token expire in 15 minutes.
- If you did not request this, no further action is required. Your account remains secure.

Best regards,
Team Sankalp & Real Access Security Team"""

    ctx = {
        "name": greeting_name,
        "reset_url": reset_link,
        "reset_token": reset_token,
        "org_name": "Jadavpur University Societies"
    }
    html, assets = render_email_template("password_reset.html", ctx)
    return text_content, html, assets


def send_password_reset_email(to_email: str, name: str, reset_token: str, reset_link: str, background: bool = True) -> bool:
    subject = "Reset your Real Access password"
    text, html, assets = build_password_reset_email(name, reset_link, reset_token)
    return _dispatch_in_background(to_email, subject, text, html, assets) if background else send_email(to_email, subject, text, html, assets)


# ==============================================================================
# 2. INVITATION EMAIL
# ==============================================================================

def build_invite_email(
    invite_link: str,
    role: str,
    term_end: Optional[str] = None,
    name: Optional[str] = None,
    org_name: Optional[str] = None,
    admin_name: Optional[str] = None
) -> Tuple[str, str, List[str]]:
    target_name = name or "Student"
    target_org = org_name or "Recognized Campus Societies"
    term_str = term_end or "End of Academic Year"
    adm_name = admin_name or "Campus Administration"

    text_content = f"""Hello {target_name},

You have been invited by {adm_name} to join {target_org} via Real Access Single Sign-On as a {role.capitalize()}.
Your active membership is valid until {term_str}.

Set up your account using the link below:
{invite_link}

Steps to activate:
1. Choose a strong password.
2. Complete a fast in-browser camera check (blink/head turn).
3. Access all connected campus clubs with 1 click.

This invitation link expires in 48 hours.

Best regards,
University Administration & Team Sankalp"""

    ctx = {
        "name": target_name,
        "org_name": target_org,
        "admin_name": adm_name,
        "role": role.capitalize(),
        "term_end": term_str,
        "invite_url": invite_link,
        "expires_in": "48 hours"
    }
    html, assets = render_email_template("invite.html", ctx)
    return text_content, html, assets


def send_invite_email(
    to_email: str,
    invite_link: str,
    role: str = "member",
    term_end: Optional[str] = None,
    name: Optional[str] = None,
    org_name: Optional[str] = None,
    admin_name: Optional[str] = None,
    background: bool = True
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    subject = f"You have been invited to join {target_org} — Real Access"
    text, html, assets = build_invite_email(invite_link, role, term_end, name, org_name, admin_name)
    return _dispatch_in_background(to_email, subject, text, html, assets) if background else send_email(to_email, subject, text, html, assets)


# ==============================================================================
# 3. APPLICATION SUBMITTED (STUDENT CONFIRMATION & ADMIN ALERT)
# ==============================================================================

def send_application_submitted_emails(
    applicant_name: str,
    applicant_email: str,
    admin_email: Optional[str] = None,
    org_name: Optional[str] = None,
    background: bool = True
) -> bool:
    """Dispatches application confirmation to student AND notification alert to admin."""
    target_org = org_name or "Jadavpur University Societies"
    adm_email = admin_email or SMTP_USER or "teamsankalp60@gmail.com"

    # A. Email to Student
    student_subject = f"Application Received — {target_org} (Real Access)"
    student_text = f"""Hello {applicant_name},

Thank you for submitting your membership application to {target_org} via Real Access.
Your application and supporting identity documentation have been securely received and are queued for administrator review.

What happens next:
1. An administrator will verify your student identity document.
2. Once approved, you will receive an approval email letting you sign in.
3. In compliance with DPDP 2023, your uploaded ID card file will be permanently erased immediately after review.

Best regards,
Institutional Registration Authority & Team Sankalp"""

    student_ctx = {
        "name": applicant_name,
        "org_name": target_org,
        "admin_email": adm_email
    }
    student_html, student_assets = render_email_template("application_submitted.html", student_ctx)

    # B. Email to Admin
    admin_subject = f"New Application Pending Review: {applicant_name}"
    admin_text = f"""Administrator Notice:

A new student has registered and is awaiting approval in the Real Access Admin Console:
- Name: {applicant_name}
- Email: {applicant_email}

Please log in to your Admin Dashboard to inspect and approve or reject this application:
{FRONTEND_ORIGIN}/admin"""

    admin_ctx = {
        "applicant_name": applicant_name,
        "applicant_email": applicant_email,
        "org_name": target_org,
        "review_url": f"{FRONTEND_ORIGIN}/admin"
    }
    admin_html, admin_assets = render_email_template("admin_new_applicant.html", admin_ctx)

    if background:
        _dispatch_in_background(applicant_email, student_subject, student_text, student_html, student_assets)
        if adm_email and adm_email != applicant_email:
            _dispatch_in_background(adm_email, admin_subject, admin_text, admin_html, admin_assets)
        return True
    else:
        s1 = send_email(applicant_email, student_subject, student_text, student_html, student_assets)
        s2 = send_email(adm_email, admin_subject, admin_text, admin_html, admin_assets) if adm_email and adm_email != applicant_email else True
        return s1 and s2


# ==============================================================================
# 4. APPLICATION APPROVED / REJECTED
# ==============================================================================

def send_application_approved_email(
    to_email: str,
    name: str,
    login_link: Optional[str] = None,
    org_name: Optional[str] = None,
    term_end: Optional[str] = None,
    role: str = "Member",
    background: bool = True
) -> bool:
    link = login_link or f"{FRONTEND_ORIGIN}/login"
    target_org = org_name or "Recognized Campus Societies"
    term_str = term_end or "End of Academic Session"

    subject = f"Your Access Has Been Approved — {target_org}"
    text_content = f"""Hello {name},

Great news! Your membership application for {target_org} has been approved by the administrator.
Your account is now ACTIVE with {role} privileges until {term_str}.

You can now log in to the Central SSO portal and access all connected campus clubs:
{link}

Security note:
During login, you will complete a quick 10-second camera check to verify your live presence.

Welcome aboard!
Team Sankalp & Real Access Registry"""

    ctx = {
        "name": name,
        "org_name": target_org,
        "login_url": link,
        "role": role,
        "term_end": term_str
    }
    html, assets = render_email_template("application_approved.html", ctx)
    return _dispatch_in_background(to_email, subject, text_content, html, assets) if background else send_email(to_email, subject, text_content, html, assets)


def send_application_rejected_email(
    to_email: str,
    name: str,
    reason: Optional[str] = None,
    org_name: Optional[str] = None,
    admin_email: Optional[str] = None,
    background: bool = True
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    adm_email = admin_email or SMTP_USER or "admin@college.edu"
    subject = f"Update regarding your application — {target_org}"
    reason_str = reason or "Documentation could not be verified by the administrator."

    text_content = f"""Hello {name},

Thank you for your interest in {target_org}.
After administrative review, we regret to inform you that your membership application could not be verified at this time.
Reason: {reason_str}

Privacy & Compliance Assurance:
In strict compliance with the Digital Personal Data Protection (DPDP) Act 2023, all identification documents and portrait photographs you provided have been permanently erased from our storage systems.

If you believe this is in error, please contact your university society coordinator.

Sincerely,
Student Identity Verification Directorate"""

    ctx = {
        "name": name,
        "org_name": target_org,
        "reason": reason_str,
        "admin_email": adm_email
    }
    html, assets = render_email_template("application_rejected.html", ctx)
    return _dispatch_in_background(to_email, subject, text_content, html, assets) if background else send_email(to_email, subject, text_content, html, assets)


# ==============================================================================
# 5. LOGIN SECURITY ALERT
# ==============================================================================

def send_login_alert_email(
    to_email: str,
    name: str,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    timestamp_str: Optional[str] = None,
    org_name: Optional[str] = None,
    background: bool = True
) -> bool:
    subject = "Security Alert: New Sign-In to Real Access"
    time_display = timestamp_str or "Just now"
    ip_display = ip or "Local network"
    ua_display = (user_agent[:60] + "...") if user_agent and len(user_agent) > 60 else (user_agent or "Web Browser")
    target_org = org_name or "Campus Single Sign-On"

    text_content = f"""Hello {name},

A new login to your Real Access account was verified with live human presence:
- Time: {time_display}
- IP Address: {ip_display}
- Device: {ua_display}

If this was you, you can safely disregard this email.
If you did not initiate this login, please reset your password immediately:
{FRONTEND_ORIGIN}/forgot-password

Best regards,
Real Access Security Guard"""

    ctx = {
        "name": name,
        "org_name": target_org,
        "time_display": time_display,
        "ip_display": ip_display,
        "ua_display": ua_display,
        "reset_url": f"{FRONTEND_ORIGIN}/forgot-password"
    }
    html, assets = render_email_template("login_alert.html", ctx)
    return _dispatch_in_background(to_email, subject, text_content, html, assets) if background else send_email(to_email, subject, text_content, html, assets)


# ==============================================================================
# 6. EXPIRY WARNING (48h / 72h ADVANCE REMINDER)
# ==============================================================================

def send_expiry_warning_email(
    to_email: str,
    name: str,
    term_end_str: str,
    days_left: int = 3,
    org_name: Optional[str] = None,
    role: str = "Member",
    admin_email: Optional[str] = None,
    background: bool = True
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    adm_email = admin_email or SMTP_USER or "admin@college.edu"
    subject = f"A short reminder: {days_left} days left of access — {target_org}"

    text_content = f"""Hello {name},

A short reminder: you have {days_left} days left until your access to {target_org} closes, in every club at once.
Access ends: {term_end_str}
Role: {role}

Want to stay on? Ask your admin to extend your term before that date. If you do nothing, your access closes automatically.

Best regards,
Automated Lifecycle Daemon & Team Sankalp"""

    ctx = {
        "name": name,
        "org_name": target_org,
        "days_left": str(days_left),
        "term_end": term_end_str,
        "role": role,
        "admin_email": adm_email
    }
    html, assets = render_email_template("term_ending.html", ctx)
    return _dispatch_in_background(to_email, subject, text_content, html, assets) if background else send_email(to_email, subject, text_content, html, assets)


# ==============================================================================
# 7. ACCOUNT EXPIRED / CONCLUDED (CLEANUP DAEMON NOTICE)
# ==============================================================================

def send_account_expired_email(
    to_email: str,
    name: str,
    reason: str = "term_end",
    org_name: Optional[str] = None,
    admin_email: Optional[str] = None,
    background: bool = True
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    adm_email = admin_email or SMTP_USER or "admin@college.edu"
    subject = f"Your access has ended — {target_org}"
    reason_label = "Term expired" if reason == "term_end" else "Inactivity (60 days)"

    text_content = f"""Hello {name},

Your access to {target_org} was closed, and you have been signed out of every club.
Reason: {reason_label}
Your account: Kept, not deleted.

If you think this is a mistake, your admin can switch your access back on.

Sincerely,
Automated Lifecycle Daemon & Team Sankalp"""

    from datetime import date
    ended_on_str = date.today().strftime("%d %b %Y")

    ctx = {
        "name": name,
        "org_name": target_org,
        "reason": reason_label,
        "ended_on": ended_on_str,
        "admin_email": adm_email
    }
    html, assets = render_email_template("access_ended.html", ctx)
    return _dispatch_in_background(to_email, subject, text_content, html, assets) if background else send_email(to_email, subject, text_content, html, assets)


# ==============================================================================
# 8. MARKED AS LEFT BY ADMINISTRATOR
# ==============================================================================

def send_marked_as_left_email(
    to_email: str,
    name: str,
    org_name: Optional[str] = None,
    admin_email: Optional[str] = None,
    background: bool = True
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    adm_email = admin_email or SMTP_USER or "admin@college.edu"
    subject = f"Your access has ended — {target_org}"

    from datetime import date
    ended_on_str = date.today().strftime("%d %b %Y")

    text_content = f"""Hello {name},

Your access to {target_org} was closed, and you have been signed out of every club.
Reason: Left the club (Administrator action)
Your account: Kept, not deleted.

If you think this is a mistake, your admin can switch your access back on.

Sincerely,
University Administration & Team Sankalp"""

    ctx = {
        "name": name,
        "org_name": target_org,
        "reason": "Left the club",
        "ended_on": ended_on_str,
        "admin_email": adm_email
    }
    html, assets = render_email_template("access_ended.html", ctx)
    return _dispatch_in_background(to_email, subject, text_content, html, assets) if background else send_email(to_email, subject, text_content, html, assets)
