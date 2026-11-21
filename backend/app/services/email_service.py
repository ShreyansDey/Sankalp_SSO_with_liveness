import os
import re
import smtplib
import ssl
import logging
import threading
import email.utils
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from typing import Optional, Tuple, List, Dict, Any
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30), name="IST")

def get_ist_now_str() -> str:
    """Returns formatted current Indian Standard Time (IST - UTC+05:30)."""
    return datetime.now(IST).strftime("%Y-%m-%d %I:%M:%S %p IST")

def to_ist_str(dt: Optional[datetime] = None) -> str:
    if dt is None:
        return get_ist_now_str()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).strftime("%Y-%m-%d %I:%M:%S %p IST")

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

    from_name = (EMAIL_FROM_NAME or "Real Access (Sankalp SSO)").strip('"\'').replace("_", " ")
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

    msg_to_send["Reply-To"] = from_addr
    msg_to_send["Date"] = email.utils.formatdate(localtime=True)
    msg_to_send["Message-ID"] = email.utils.make_msgid(domain=from_addr.split("@")[-1] if "@" in from_addr else "gmail.com")
    msg_to_send["Auto-Submitted"] = "auto-generated"
    msg_to_send["X-Auto-Response-Suppress"] = "All"

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


def build_password_changed_email(name: str, ip: str, user_agent: str, time_str: str) -> tuple[str, str]:
    """Generate email templates when password has been successfully changed."""
    greeting = name.strip() if name and name.strip() else "Member"
    text_content = f"""Hello {greeting},

Security Notice: The password for your Real Access account was just updated.

Details:
- Time: {time_str}
- IP Address: {ip}
- Device / Browser: {user_agent}

Your previous password has been permanently disabled, and all existing active sessions have been invalidated across all campus club portals.

If you made this change, no further action is required.
If you did NOT authorize this change, please contact your university administrator immediately.

— Team Sankalp (Real Person, Real Access SSO)
"""
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Security Alert: Password Changed</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3EFE7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #12171E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F3EFE7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2DCCF; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0">
          <tr>
            <td style="background-color: #12171E; padding: 24px 32px;">
              <span style="color: #F5F1E8; font-size: 20px; font-weight: 600; font-family: Georgia, serif;">Real Access</span>
              <span style="color: #D9822B; font-size: 11px; font-weight: 700; margin-left: 8px; letter-spacing: 1.5px; text-transform: uppercase;">SECURITY ALERT</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 36px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-family: Georgia, serif; color: #12171E;">Password Changed Successfully</h2>
              <p style="color: #5A6270; font-size: 15px; line-height: 1.55; margin: 0 0 20px;">
                Hello <strong>{greeting}</strong>, your account password was recently changed. Your previous password has been permanently disabled, and all active login sessions have been terminated.
              </p>
              <div style="background-color: #FBF9F4; border: 1px solid #DDD6C7; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13.5px; color: #3A4250;">
                <p style="margin: 4px 0;"><strong>Time:</strong> {time_str}</p>
                <p style="margin: 4px 0;"><strong>IP Address:</strong> {ip}</p>
                <p style="margin: 4px 0; word-break: break-all;"><strong>Device:</strong> {user_agent}</p>
              </div>
              <p style="color: #8A92A0; font-size: 12px; margin: 20px 0 0; line-height: 1.5; border-top: 1px solid #EAE5D9; padding-top: 16px;">
                If you performed this change, you can safely disregard this email.<br/>
                <strong>Did not change your password?</strong> Please contact an administrator immediately.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return text_content, html_content


def send_password_changed_email(to_email: str, name: str, ip: str, user_agent: str, background: bool = True) -> bool:
    """Dispatches password changed security alert email asynchronously."""
    time_str = get_ist_now_str()
    subject = "Security Alert: Real Access Password Changed"
    text_content, html_content = build_password_changed_email(name, ip, user_agent, time_str)
    if background:
        thread = threading.Thread(
            target=send_email,
            args=(to_email, subject, text_content, html_content),
            daemon=True
        )
        thread.start()
        logger.info("Dispatched password changed notification email to %s", to_email)
        return True
    else:
        return send_email(to_email, subject, text_content, html_content)



def build_mark_as_left_email(name: str, renew_url: str) -> tuple[str, str]:
    """Generate email templates when user is marked as left by admin (48h purge notice)."""
    greeting_name = name.strip() if name and name.strip() else "Member"

    text_content = f"""Hello {greeting_name},

Notice: An administrator has revoked your access permissions across all campus club applications (Mark as Left).

48-HOUR RENEWAL & PURGE NOTICE:
If this revocation was done accidentally, you may apply to renew and restore your access within 48 hours by visiting:
{renew_url}

IMPORTANT:
If no renewal is requested and approved within 48 hours, all your credential data and account records will be COMPLETELY PURGED from the entire database. Once purged, you will be required to register again from scratch.

PLEASE NOTE:
If the decision to revoke your access was intentional, or you have already applied for renewal, please ignore this email.

— Team Sankalp (Real Person, Real Access SSO)
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Access Revoked — 48-Hour Purge Notice</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAFAF7; margin: 0; padding: 24px; color: #1C1917;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E7E5E4; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="padding: 24px 32px; background-color: #0F172A; color: #FFFFFF;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.02em;">Sankalp SSO &bull; Real Access</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #94A3B8;">Security Notification &bull; Access Revoked</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <p style="font-size: 16px; margin: 0 0 16px;">Hello <strong>{greeting_name}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #44403C; margin: 0 0 16px;">
          An administrator has revoked your access permissions across all connected campus applications (status set to <em>Mark as Left</em>).
        </p>

        <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <h4 style="margin: 0 0 8px; color: #B45309; font-size: 14px;">⏳ 48-Hour Recovery Window Active</h4>
          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #92400E;">
            If this revocation was performed <strong>accidentally</strong>, you have a <strong>48-hour grace window</strong> to submit a renewal request to an administrator.
          </p>
          <p style="margin: 8px 0 0; font-size: 13px; line-height: 1.5; color: #92400E;">
            If not renewed within 48 hours, <strong>all your credential data and account records will be COMPLETELY PURGED from the entire database</strong>. You would need to re-register from scratch to regain access.
          </p>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="{renew_url}" style="background-color: #0F172A; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
            Apply for Access Renewal
          </a>
        </div>

        <p style="color: #DC2626; font-size: 13px; font-weight: 600; background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 12px; margin: 24px 0 0; line-height: 1.5;">
          ⚠️ Important Notice: If this decision was intentional or you have already applied for renewal, please ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 32px; background-color: #F5F5F4; border-top: 1px solid #E7E5E4; font-size: 12px; color: #78716C; text-align: center;">
        Real Access &bull; Team Sankalp &bull; Cybersecurity & Digital Identity SSO
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return text_content, html_content


def build_expired_email(name: str, renew_url: str, reason: str = "term_end") -> tuple[str, str]:
    """Generate email templates when user membership or activity limit expires (48h purge notice)."""
    greeting_name = name.strip() if name and name.strip() else "Member"
    reason_label = "membership term has reached its end date" if reason == "term_end" else "account has been inactive for over 60 days"

    text_content = f"""Hello {greeting_name},

Notice: Your access through Sankalp SSO has expired because your {reason_label}.

48-HOUR RENEWAL & PURGE NOTICE:
To restore or renew your membership, please contact an administrator or submit a renewal application within 48 hours by visiting:
{renew_url}

IMPORTANT:
If no renewal is requested and approved within 48 hours, all your credential data and account records will be COMPLETELY PURGED from the entire database.

PLEASE NOTE:
If this expiration was expected or you have already applied for renewal, please ignore this email.

— Team Sankalp (Real Person, Real Access SSO)
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Activity Limit Expired — 48-Hour Purge Notice</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAFAF7; margin: 0; padding: 24px; color: #1C1917;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E7E5E4; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="padding: 24px 32px; background-color: #0F172A; color: #FFFFFF;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.02em;">Sankalp SSO &bull; Real Access</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #94A3B8;">Security Notification &bull; Access Expired</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <p style="font-size: 16px; margin: 0 0 16px;">Hello <strong>{greeting_name}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #44403C; margin: 0 0 16px;">
          Your access permissions through Sankalp SSO have expired because your <strong>{reason_label}</strong>.
        </p>

        <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <h4 style="margin: 0 0 8px; color: #B45309; font-size: 14px;">⏳ 48-Hour Renewal Window</h4>
          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #92400E;">
            To renew your membership, contact an administrator or apply for renewal within the next <strong>48 hours</strong>.
          </p>
          <p style="margin: 8px 0 0; font-size: 13px; line-height: 1.5; color: #92400E;">
            Otherwise, after 48 hours, <strong>all your credential data and account records will be COMPLETELY PURGED from the entire database</strong>.
          </p>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="{renew_url}" style="background-color: #0F172A; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
            Apply for Membership Renewal
          </a>
        </div>

        <p style="color: #DC2626; font-size: 13px; font-weight: 600; background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 12px; margin: 24px 0 0; line-height: 1.5;">
          ⚠️ Important Notice: If this expiration was expected or you have already applied for renewal, please ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 32px; background-color: #F5F5F4; border-top: 1px solid #E7E5E4; font-size: 12px; color: #78716C; text-align: center;">
        Real Access &bull; Team Sankalp &bull; Cybersecurity & Digital Identity SSO
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return text_content, html_content


def build_renewal_status_email(name: str, status: str, admin_notes: Optional[str] = None) -> tuple[str, str]:
    """Generate email templates when admin approves or declines a renewal request."""
    greeting_name = name.strip() if name and name.strip() else "Member"
    is_approved = (status.lower() == "approved")

    if is_approved:
        subject_line = "✅ Access Restored — Your Renewal Request was Approved"
        headline = "Renewal Request Approved!"
        header_color = "#047857"  # Green
        body_text = "Good news! An administrator has reviewed and approved your access renewal request. Your account has been reactivated, and you can now log in normally to all connected campus club facilities."
    else:
        subject_line = "❌ Update: Your Access Renewal Request was Declined"
        headline = "Renewal Request Declined"
        header_color = "#B91C1C"  # Red
        body_text = "Your request for access renewal has been reviewed and declined by an administrator. In accordance with data privacy lifecycle regulations, your account records are scheduled for permanent purge."

    notes_section_txt = f"\nAdministrator Notes: {admin_notes}\n" if admin_notes else ""
    notes_section_html = f"""<div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px; margin: 16px 0;"><strong>Administrator Notes:</strong> {admin_notes}</div>""" if admin_notes else ""

    text_content = f"""Hello {greeting_name},

{subject_line}

{body_text}
{notes_section_txt}
— Team Sankalp (Real Person, Real Access SSO)
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{subject_line}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAFAF7; margin: 0; padding: 24px; color: #1C1917;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E7E5E4; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="padding: 24px 32px; background-color: {header_color}; color: #FFFFFF;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 600;">{headline}</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255, 255, 255, 0.85);">Sankalp SSO &bull; Real Access</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <p style="font-size: 16px; margin: 0 0 16px;">Hello <strong>{greeting_name}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #44403C; margin: 0 0 16px;">
          {body_text}
        </p>
        {notes_section_html}
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 32px; background-color: #F5F5F4; border-top: 1px solid #E7E5E4; font-size: 12px; color: #78716C; text-align: center;">
        Real Access &bull; Team Sankalp &bull; Cybersecurity & Digital Identity SSO
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return text_content, html_content


def send_mark_as_left_email(
    to_email: str,
    name: str,
    renew_url: str,
    background: bool = True
) -> bool:
    """Dispatches 48-hour recovery notice when admin marks user as left."""
    subject = "Sankalp SSO: Notice of Account Deactivation & 48-Hour Recovery Window"
    text_content, html_content = build_mark_as_left_email(name, renew_url)
    if background:
        thread = threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True)
        thread.start()
        logger.info("Dispatched mark_as_left notice email to %s", to_email)
        return True
    return send_email(to_email, subject, text_content, html_content)


def send_expired_email(
    to_email: str,
    name: str,
    renew_url: str,
    reason: str = "term_end",
    background: bool = True
) -> bool:
    """Dispatches 48-hour recovery notice when user access expires automatically."""
    subject = "Sankalp SSO: Notice of Membership Expiration & 48-Hour Recovery Window"
    text_content, html_content = build_expired_email(name, renew_url, reason)
    if background:
        thread = threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True)
        thread.start()
        logger.info("Dispatched expiration notice email to %s (reason: %s)", to_email, reason)
        return True
    return send_email(to_email, subject, text_content, html_content)


def send_renewal_status_email(
    to_email: str,
    name: str,
    status: str,
    admin_notes: Optional[str] = None,
    background: bool = True
) -> bool:
    """Dispatches approval or decline notice for a renewal request."""
    subject = "Sankalp SSO: Access Renewal Request Approved" if status.lower() == "approved" else "Sankalp SSO: Access Renewal Request Status Update"
    text_content, html_content = build_renewal_status_email(name, status, admin_notes)
    if background:
        thread = threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True)
        thread.start()
        logger.info("Dispatched renewal %s notice email to %s", status, to_email)
        return True
    return send_email(to_email, subject, text_content, html_content)


def build_final_purge_takeout_email(user_data: dict) -> tuple[str, str]:
    """
    Generate final data takeout export & farewell email templates dispatched at the exact moment
    an account is permanently hard-purged from the database after the 48-hour period.
    """
    name = (user_data.get("name") or "Member").strip()
    email = user_data.get("email") or "N/A"
    phone = user_data.get("phone") or "Not provided"
    created_at = user_data.get("created_at")
    disabled_at = user_data.get("disabled_at")
    reason = user_data.get("disabled_reason") or "left"

    created_str = created_at.strftime("%Y-%m-%d %H:%M UTC") if hasattr(created_at, "strftime") else str(created_at or "N/A")
    disabled_str = disabled_at.strftime("%Y-%m-%d %H:%M UTC") if hasattr(disabled_at, "strftime") else str(disabled_at or "N/A")

    reason_desc = "Administrative Revocation (Mark as Left)" if reason == "left" else \
                  "Membership Term Expiration" if reason == "term_end" else \
                  "60-Day Account Inactivity" if reason == "inactive" else reason

    text_content = f"""Hello {name},

FINAL DATA TAKEOUT & COMPLETE DATABASE PURGE NOTICE:
Your 48-hour recovery window has completed. In accordance with our digital privacy and data retention policy, all your credential records, authentication profiles, and identity templates have been PERMANENTLY AND COMPLETELY PURGED from the entire database and storage vault. No frozen records remain.

SUMMARY OF RECORDED DATA (EXPORTED PRIOR TO PURGE):
--------------------------------------------------
• Full Name: {name}
• Registered Email: {email}
• Contact Phone: {phone}
• Account Enrolled On: {created_str}
• Deactivation Date: {disabled_str}
• Deactivation Reason: {reason_desc}
• Biometric Data: Raw webcam video was never saved. Your 128-dimensional facial embedding vector has been permanently destroyed.
• Supporting Identification: Uploaded student ID document files on disk have been completely erased.
--------------------------------------------------

RE-ENTRY INSTRUCTIONS:
Because all your records have been completely and permanently erased from the system, you cannot restore this account. If you wish to rejoin or access campus club facilities in the future, you must submit a new registration with complete data and complete the e-KYC verification process again from scratch.

Thank you for your time with our organization.

— Team Sankalp (Real Person, Real Access SSO)
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Final Data Takeout & Complete Database Purge Notice</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAFAF7; margin: 0; padding: 24px; color: #1C1917;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E7E5E4; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="padding: 24px 32px; background-color: #0F172A; color: #FFFFFF;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 600;">Sankalp SSO &bull; Real Access</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #94A3B8;">Final Data Takeout &bull; Permanent Database Purge Notice</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <p style="font-size: 16px; margin: 0 0 16px;">Hello <strong>{name}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #44403C; margin: 0 0 20px;">
          Your <strong>48-hour recovery window has concluded</strong>. In accordance with institutional data minimization and privacy standards, <strong>all your credential records, session tokens, and identity templates have been COMPLETELY AND PERMANENTLY PURGED from our database and storage vault</strong>. No frozen records remain in the system.
        </p>

        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h4 style="margin: 0 0 12px; font-size: 14px; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">
            📋 Final Personal Data Export (Takeout)
          </h4>
          <table width="100%" style="font-size: 13px; color: #334155; line-height: 1.6;">
            <tr><td style="padding: 4px 0; font-weight: 600; width: 160px;">Full Name:</td><td>{name}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Institutional Email:</td><td>{email}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Contact Phone:</td><td>{phone}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Account Created:</td><td>{created_str}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Deactivation Date:</td><td>{disabled_str}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Deactivation Reason:</td><td>{reason_desc}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Biometric Embeddings:</td><td>128D mathematical vector permanently destroyed (zero video ever stored)</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">Stored Documents:</td><td>All uploaded student ID files permanently erased from disk</td></tr>
          </table>
        </div>

        <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 16px; margin: 24px 0;">
          <h4 style="margin: 0 0 6px; color: #DC2626; font-size: 14px;">Re-entering the Organization</h4>
          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #991B1B;">
            Because all your data records have been completely purged from the entire system, this account cannot be restored. To rejoin or access connected campus club facilities in the future, you must submit a new registration and complete e-KYC verification again from scratch.
          </p>
        </div>

        <p style="font-size: 13px; color: #78716C; margin: 20px 0 0; line-height: 1.5;">
          Thank you for your participation in campus club programs.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 32px; background-color: #F5F5F4; border-top: 1px solid #E7E5E4; font-size: 12px; color: #78716C; text-align: center;">
        Real Access &bull; Team Sankalp &bull; Cybersecurity & Digital Identity SSO
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return text_content, html_content


def send_final_purge_takeout_email(
    to_email: str,
    user_data: dict,
    background: bool = True
) -> bool:
    """Dispatches final data export & permanent database purge notification email."""
    subject = "Sankalp SSO: Personal Data Export & Notice of Permanent Database Purge"
    text_content, html_content = build_final_purge_takeout_email(user_data)
    if background:
        thread = threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True)
        thread.start()
        logger.info("Dispatched final purge takeout email to %s", to_email)
        return True
    return send_email(to_email, subject, text_content, html_content)


def send_disable_face_lock_otp_email(
    to_email: str,
    admin_name: str,
    otp_code: str,
    background: bool = True
) -> bool:
    """
    Sends out-of-band 2FA OTP email required to downgrade security and disable Biometric Face Lock.
    Uses the system's official Real Access email layout.
    """
    subject = "Security Action: 2-Step Verification Code — Real Access"
    now_str = get_ist_now_str()

    ctx = {
        "name": admin_name.strip() if admin_name else "Administrator",
        "email": to_email,
        "otp_code": otp_code,
        "timestamp": now_str,
        "org_name": "Jadavpur University Clubs",
        "admin_email": to_email
    }
    html_content, inline_assets = render_email_template("admin_2fa_otp.html", ctx)

    text_content = (
        f"Confirm Disabling Biometric Face Lock\n\n"
        f"Hello {ctx['name']},\n"
        f"Your 6-digit verification code: {otp_code}\n\n"
        f"Expires in 5 minutes. If you did not request this, your admin session may be compromised.\n"
        f"Requested at: {now_str}\n"
    )

    if background:
        return _dispatch_in_background(to_email, subject, text_content, html_content, inline_assets)
    return send_email(to_email, subject, text_content, html_content, inline_assets)

