import os
import smtplib
import ssl
import logging
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Tuple

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

def send_email(
    to_email: str,
    subject: str,
    text_content: str,
    html_content: Optional[str] = None
) -> bool:
    """
    Send an email via configured SMTP server (Gmail, institutional SMTP, etc.).
    Supports STARTTLS (port 587) and SSL (port 465).
    Never logs email passwords or tokens.
    """
    if not SMTP_HOST or not SMTP_USER:
        logger.warning(
            "SMTP is not configured (SMTP_HOST or SMTP_USER missing). Email to %s not sent via network.",
            to_email
        )
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    from_name = EMAIL_FROM_NAME or "Real Access (Sankalp SSO)"
    from_addr = EMAIL_FROM or SMTP_USER
    msg["From"] = f"{from_name} <{from_addr}>"
    msg["To"] = to_email

    # Attach plain text and HTML versions
    part_text = MIMEText(text_content, "plain", "utf-8")
    msg.attach(part_text)

    if html_content:
        part_html = MIMEText(html_content, "html", "utf-8")
        msg.attach(part_html)

    clean_pass = SMTP_PASS.replace(" ", "").strip() if SMTP_PASS else ""

    try:
        if SMTP_SECURE == "ssl" or SMTP_PORT == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=15) as server:
                if SMTP_USER and clean_pass:
                    server.login(SMTP_USER, clean_pass)
                server.send_message(msg)
        else:
            # STARTTLS / TLS mode (standard for Gmail port 587)
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.ehlo()
                if SMTP_SECURE in ["tls", "starttls"] or SMTP_PORT == 587:
                    context = ssl.create_default_context()
                    server.starttls(context=context)
                    server.ehlo()
                if SMTP_USER and clean_pass:
                    server.login(SMTP_USER, clean_pass)
                server.send_message(msg)

        logger.info("Successfully sent email to %s (Subject: %s)", to_email, subject)
        return True

    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, str(e))
        return False


def _dispatch_in_background(to_email: str, subject: str, text_content: str, html_content: Optional[str]) -> bool:
    """Helper to dispatch email in a detached daemon thread."""
    thread = threading.Thread(
        target=send_email,
        args=(to_email, subject, text_content, html_content),
        daemon=True
    )
    thread.start()
    return True


def build_institutional_html(title: str, category_badge: str, content_html: str) -> str:
    """Reusable institutional template wrapper with crisp design system."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3EFE7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #12171E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F3EFE7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2DCCF; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #12171E; padding: 24px 32px; text-align: left;">
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="display: inline-block; vertical-align: middle; width: 26px; height: 26px; border-radius: 50%; border: 2px solid #D9822B; text-align: center; line-height: 26px;">
                      <span style="color: #D9822B; font-weight: bold; font-size: 15px;">&bull;</span>
                    </div>
                    <span style="color: #F5F1E8; font-size: 19px; font-weight: 600; letter-spacing: 0.3px; font-family: Georgia, serif; vertical-align: middle; margin-left: 10px;">Real Access</span>
                    <span style="display: inline-block; vertical-align: middle; margin-left: 10px; background: rgba(217, 130, 43, 0.2); border: 1px solid #D9822B; color: #D9822B; font-size: 10.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 2px 8px; border-radius: 4px;">{category_badge}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              {content_html}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9F7F3; border-top: 1px solid #E6E0D4; padding: 18px 32px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #8C8574;">
                Real Access &bull; Team Sankalp &bull; Cybersecurity & Digital Identity SSO
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


# ==============================================================================
# 1. PASSWORD RESET
# ==============================================================================

def build_password_reset_email(name: str, reset_link: str, reset_token: str) -> Tuple[str, str]:
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

    inner_html = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #12171E; font-family: Georgia, serif;">Password Reset Request</h2>
      <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Hello <strong>{greeting_name}</strong>,
      </p>
      <p style="margin: 0 0 22px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        We received a request to reset your password for your Real Access single sign-on account. Click the button below to choose a new password:
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
        <tr>
          <td style="border-radius: 8px; background-color: #D9822B;">
            <a href="{reset_link}" target="_blank" style="display: inline-block; padding: 12px 26px; font-size: 14px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 8px;">
              Reset Password &rarr;
            </a>
          </td>
        </tr>
      </table>
      <div style="background-color: #F3EFE7; border-left: 4px solid #D9822B; padding: 12px 16px; margin-bottom: 22px; border-radius: 0 6px 6px 0;">
        <div style="font-size: 11.5px; font-weight: 600; color: #8A4A0F; margin-bottom: 4px; text-transform: uppercase;">Verification Token</div>
        <div style="font-family: monospace; font-size: 13px; color: #12171E; font-weight: bold; word-break: break-all;">
          {reset_token}
        </div>
      </div>
      <div style="border-top: 1px solid #ECE7DD; padding-top: 18px; font-size: 12.5px; color: #7A8290; line-height: 1.5;">
        &bull; This link and token expire in <strong>15 minutes</strong>.<br>
        &bull; If you did not request this, please ignore this email. Your account is completely secure.
      </div>"""

    return text_content, build_institutional_html("Reset Your Password", "SECURITY", inner_html)

def send_password_reset_email(to_email: str, name: str, reset_token: str, reset_link: str, background: bool = True) -> bool:
    subject = "Reset your Real Access password"
    text, html = build_password_reset_email(name, reset_link, reset_token)
    return _dispatch_in_background(to_email, subject, text, html) if background else send_email(to_email, subject, text, html)


# ==============================================================================
# 2. INVITATION EMAIL
# ==============================================================================

def build_invite_email(invite_link: str, role: str, term_end: Optional[str] = None) -> Tuple[str, str]:
    term_msg = f"\nYour active membership term is scheduled through {term_end}." if term_end else ""
    text_content = f"""Hello,

You have been invited to join the Real Access Single Sign-On campus registry as a {role.capitalize()}.{term_msg}

To complete your account registration, please click the link below:
{invite_link}

This invitation link is valid for 7 days.

Best regards,
University Administration & Team Sankalp"""

    term_badge = f"""<div style="background-color: #EAF5EE; border: 1px solid #CCE6D4; color: #1F6B3F; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; margin-bottom: 20px;">
      &bull; Assigned Term: <strong>Through {term_end}</strong>
    </div>""" if term_end else ""

    inner_html = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #12171E; font-family: Georgia, serif;">You Are Invited to Join Real Access</h2>
      <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        An administrator has issued you an invitation to activate your official university single sign-on profile with <strong>{role.capitalize()}</strong> privileges.
      </p>
      {term_badge}
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
        <tr>
          <td style="border-radius: 8px; background-color: #12171E;">
            <a href="{invite_link}" target="_blank" style="display: inline-block; padding: 12px 26px; font-size: 14px; font-weight: 600; color: #F5F1E8; text-decoration: none; border-radius: 8px; border: 1px solid #D9822B;">
              Accept Invitation &rarr;
            </a>
          </td>
        </tr>
      </table>
      <div style="border-top: 1px solid #ECE7DD; padding-top: 18px; font-size: 12.5px; color: #7A8290; line-height: 1.5;">
        &bull; This invitation link is valid for <strong>7 days</strong>.<br>
        &bull; Once accepted, you can access all recognized university clubs and facilities with 1-click single sign-on.
      </div>"""

    return text_content, build_institutional_html("Invitation to Real Access", "INVITATION", inner_html)

def send_invite_email(to_email: str, invite_link: str, role: str = "member", term_end: Optional[str] = None, background: bool = True) -> bool:
    subject = "You have been invited to join Real Access"
    text, html = build_invite_email(invite_link, role, term_end)
    return _dispatch_in_background(to_email, subject, text, html) if background else send_email(to_email, subject, text, html)


# ==============================================================================
# 3. APPLICATION SUBMITTED (STUDENT CONFIRMATION & ADMIN ALERT)
# ==============================================================================

def send_application_submitted_emails(applicant_name: str, applicant_email: str, admin_email: Optional[str] = None, background: bool = True) -> bool:
    """Dispatches application confirmation to student AND notification alert to admin."""
    # A. Email to Student
    student_subject = "Application Received — Real Access Member Registry"
    student_text = f"""Hello {applicant_name},

Thank you for submitting your membership application to Real Access.
Your application, facial portrait snapshot, and supporting identity documentation have been securely received and are queued for administrator review.

What happens next:
1. An administrator will verify your student identity document.
2. Once approved, you will receive an email letting you know you can sign in.
3. In compliance with DPDP 2023, your uploaded ID card file will be permanently erased immediately after review.

Best regards,
Institutional Registration Authority & Team Sankalp"""

    student_inner = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #12171E; font-family: Georgia, serif;">Membership Application Received</h2>
      <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Hello <strong>{applicant_name}</strong>,
      </p>
      <p style="margin: 0 0 20px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Your self-service membership registration has been received. Your account is currently in <strong>Pending Review</strong> status while our administrators verify your student identity documents.
      </p>
      <div style="background-color: #FBF9F4; border: 1px solid #E5DFD3; border-radius: 8px; padding: 16px 20px; margin-bottom: 22px;">
        <div style="font-size: 13.5px; font-weight: 600; color: #12171E; margin-bottom: 8px;">Next Steps:</div>
        <ol style="margin: 0; padding-left: 18px; font-size: 13px; color: #5A6270; line-height: 1.6;">
          <li>Institutional administrator reviews your uploaded credentials.</li>
          <li>You will receive an instant approval notification email.</li>
          <li>Per DPDP 2023 privacy law, all uploaded verification documents are permanently erased immediately upon review.</li>
        </ol>
      </div>"""
    student_html = build_institutional_html(student_subject, "APPLICATION", student_inner)

    # B. Email to Admin
    target_admin = admin_email or SMTP_USER or "teamsankalp60@gmail.com"
    admin_subject = f"New Application Pending Review: {applicant_name}"
    admin_text = f"""Administrator Notice:

A new student has registered and is awaiting approval in the Real Access Admin Console:
- Name: {applicant_name}
- Email: {applicant_email}

Please log in to your Admin Dashboard to inspect and approve or reject this application:
{FRONTEND_ORIGIN}/admin"""

    admin_inner = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #12171E; font-family: Georgia, serif;">New Application Pending Review</h2>
      <p style="margin: 0 0 18px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        A new student has completed registration and uploaded identification documents:
      </p>
      <div style="background-color: #FBF9F4; border: 1px solid #E5DFD3; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px;">
        <div style="font-size: 14px; font-weight: 600; color: #12171E;">{applicant_name}</div>
        <div style="font-size: 13px; color: #5A6270; font-family: monospace;">{applicant_email}</div>
      </div>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 20px 0;">
        <tr>
          <td style="border-radius: 8px; background-color: #12171E;">
            <a href="{FRONTEND_ORIGIN}/admin" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 14px; font-weight: 600; color: #F5F1E8; text-decoration: none; border-radius: 8px; border: 1px solid #D9822B;">
              Open Admin Console &rarr;
            </a>
          </td>
        </tr>
      </table>"""
    admin_html = build_institutional_html(admin_subject, "ADMIN ALERT", admin_inner)

    if background:
        _dispatch_in_background(applicant_email, student_subject, student_text, student_html)
        if target_admin and target_admin != applicant_email:
            _dispatch_in_background(target_admin, admin_subject, admin_text, admin_html)
        return True
    else:
        s1 = send_email(applicant_email, student_subject, student_text, student_html)
        s2 = send_email(target_admin, admin_subject, admin_text, admin_html) if target_admin and target_admin != applicant_email else True
        return s1 and s2


# ==============================================================================
# 4. APPLICATION APPROVED / REJECTED
# ==============================================================================

def send_application_approved_email(to_email: str, name: str, login_link: Optional[str] = None, background: bool = True) -> bool:
    link = login_link or f"{FRONTEND_ORIGIN}/login"
    subject = "Your Real Access Application Has Been Approved!"
    text_content = f"""Hello {name},

Great news! Your membership application has been approved by the administrator.
Your account is now ACTIVE.

You can now log in to the Central SSO portal and access all connected campus clubs:
{link}

Security note:
During login, you will complete a quick 10-second camera check to verify your live presence.

Welcome aboard!
Team Sankalp & Real Access Registry"""

    inner_html = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #1F6B3F; font-family: Georgia, serif;">Application Approved!</h2>
      <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Hello <strong>{name}</strong>,
      </p>
      <p style="margin: 0 0 20px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Your identity documents have been verified and your Real Access membership account is now <strong>Active</strong>. You have full 1-click access across all recognized university clubs and facilities.
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
        <tr>
          <td style="border-radius: 8px; background-color: #1F6B3F;">
            <a href="{link}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 8px;">
              Log In to Campus Clubs &rarr;
            </a>
          </td>
        </tr>
      </table>
      <div style="border-top: 1px solid #ECE7DD; padding-top: 18px; font-size: 12.5px; color: #7A8290; line-height: 1.5;">
        &bull; Privacy Notice: In compliance with DPDP 2023, your submitted ID document has been permanently purged from our servers.<br>
        &bull; You can now sign in with your email, password, and instant camera liveness check.
      </div>"""

    html = build_institutional_html(subject, "APPROVED", inner_html)
    return _dispatch_in_background(to_email, subject, text_content, html) if background else send_email(to_email, subject, text_content, html)


def send_application_rejected_email(to_email: str, name: str, reason: Optional[str] = None, background: bool = True) -> bool:
    subject = "Update regarding your Real Access application"
    reason_text = f"\nReason: {reason}" if reason else ""
    text_content = f"""Hello {name},

Thank you for your interest in Real Access.
After administrative review, we regret to inform you that your membership application could not be verified at this time.{reason_text}

Privacy & Compliance Assurance:
In strict compliance with the Digital Personal Data Protection (DPDP) Act 2023, all identification documents and portrait photographs you provided have been permanently erased from our storage systems.

If you believe this is in error, please contact your university society coordinator.

Sincerely,
Student Identity Verification Directorate"""

    inner_html = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #9B3A22; font-family: Georgia, serif;">Application Update</h2>
      <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Hello <strong>{name}</strong>,
      </p>
      <p style="margin: 0 0 20px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        We regret to inform you that your application for a Real Access account could not be validated by the administrative authority.
      </p>
      <div style="background-color: #FDF1ED; border-left: 4px solid #9B3A22; padding: 14px 18px; margin-bottom: 22px;">
        <div style="font-size: 13px; font-weight: 600; color: #9B3A22; margin-bottom: 4px;">Data Privacy Compliance (DPDP 2023)</div>
        <div style="font-size: 12.5px; color: #5A6270; line-height: 1.5;">
          All personal data, uploaded identification documents, and face biometric photos submitted with your request have been permanently erased from institutional systems.
        </div>
      </div>"""

    html = build_institutional_html(subject, "STATUS UPDATE", inner_html)
    return _dispatch_in_background(to_email, subject, text_content, html) if background else send_email(to_email, subject, text_content, html)


# ==============================================================================
# 5. LOGIN SECURITY ALERT
# ==============================================================================

def send_login_alert_email(to_email: str, name: str, ip: Optional[str] = None, user_agent: Optional[str] = None, timestamp_str: Optional[str] = None, background: bool = True) -> bool:
    subject = "Security Alert: New Sign-In to Real Access"
    time_display = timestamp_str or "Just now"
    ip_display = ip or "Local network"
    ua_display = (user_agent[:60] + "...") if user_agent and len(user_agent) > 60 else (user_agent or "Web Browser")

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

    inner_html = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #12171E; font-family: Georgia, serif;">New Sign-In Detected</h2>
      <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Hello <strong>{name}</strong>,
      </p>
      <p style="margin: 0 0 18px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Your Real Access account was just signed into following successful camera liveness authentication:
      </p>
      <div style="background-color: #FBF9F4; border: 1px solid #E5DFD3; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; font-size: 13px; line-height: 1.6;">
        <div><strong>Timestamp:</strong> {time_display}</div>
        <div><strong>IP Address:</strong> {ip_display}</div>
        <div><strong>Browser / Client:</strong> {ua_display}</div>
      </div>
      <div style="border-top: 1px solid #ECE7DD; padding-top: 18px; font-size: 12.5px; color: #7A8290; line-height: 1.5;">
        &bull; If this was you, no action is needed.<br>
        &bull; If you did not log in, <a href="{FRONTEND_ORIGIN}/forgot-password" style="color: #9B3A22; font-weight: 600;">reset your password immediately</a> to revoke all active sessions.
      </div>"""

    html = build_institutional_html(subject, "SECURITY ALERT", inner_html)
    return _dispatch_in_background(to_email, subject, text_content, html) if background else send_email(to_email, subject, text_content, html)


# ==============================================================================
# 6. EXPIRY WARNING (48h / 72h ADVANCE REMINDER)
# ==============================================================================

def send_expiry_warning_email(to_email: str, name: str, term_end_str: str, days_left: int = 3, background: bool = True) -> bool:
    subject = f"Reminder: Your Real Access Membership Expires in {days_left} Days"
    text_content = f"""Hello {name},

This is an automated courtesy reminder that your student membership access in Real Access is scheduled to expire on:
{term_end_str} ({days_left} days remaining).

When your term concludes:
- Access to connected campus societies (Photography, Robotics, Coding, Chess, Athletics) will end automatically.
- All active sessions and refresh tokens will be cleanly revoked.

If you are continuing for another academic session, please contact your departmental administrator for a term renewal.

Best regards,
Automated Lifecycle Daemon & Team Sankalp"""

    inner_html = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #8A4A0F; font-family: Georgia, serif;">Membership Expiry Warning</h2>
      <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Hello <strong>{name}</strong>,
      </p>
      <p style="margin: 0 0 18px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        This is an automated lifecycle notice that your active campus SSO membership is scheduled to expire soon:
      </p>
      <div style="background-color: #FDF4E7; border-left: 4px solid #D9822B; padding: 14px 18px; margin-bottom: 22px;">
        <div style="font-size: 12px; font-weight: 600; color: #8A4A0F; text-transform: uppercase;">Scheduled Expiry Date</div>
        <div style="font-size: 16px; font-weight: 600; color: #12171E; margin-top: 2px;">{term_end_str} ({days_left} days remaining)</div>
      </div>
      <div style="border-top: 1px solid #ECE7DD; padding-top: 18px; font-size: 12.5px; color: #7A8290; line-height: 1.5;">
        &bull; When expired, single sign-on access to all 5 connected campus societies will automatically terminate.<br>
        &bull; If you are eligible for a term renewal, please coordinate with your society administrator before your expiry date.
      </div>"""

    html = build_institutional_html(subject, "EXPIRY NOTICE", inner_html)
    return _dispatch_in_background(to_email, subject, text_content, html) if background else send_email(to_email, subject, text_content, html)


# ==============================================================================
# 7. ACCOUNT EXPIRED / CONCLUDED (CLEANUP DAEMON NOTICE)
# ==============================================================================

def send_account_expired_email(to_email: str, name: str, reason: str = "term_end", background: bool = True) -> bool:
    subject = "Notice: Your Real Access Membership Has Concluded"
    reason_label = "academic term completion" if reason == "term_end" else "extended 60-day inactivity"
    
    text_content = f"""Hello {name},

In accordance with institutional access policies, your Real Access account has concluded due to {reason_label}.

Security Summary:
- Your access status is now: Disabled.
- All active single sign-on sessions have been immediately terminated.
- All issued OAuth 2.0 refresh tokens have been revoked across all connected societies.

We thank you for your participation in university clubs and societies!

Sincerely,
Automated Lifecycle Daemon & Team Sankalp"""

    inner_html = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #9B3A22; font-family: Georgia, serif;">Membership Access Concluded</h2>
      <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Hello <strong>{name}</strong>,
      </p>
      <p style="margin: 0 0 18px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        In accordance with automatic lifecycle security policies, your access to university digital services has concluded due to <strong>{reason_label}</strong>.
      </p>
      <div style="background-color: #FDF1ED; border: 1px solid #F3C7BC; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; font-size: 13px; color: #5A6270; line-height: 1.6;">
        <div>&bull; <strong>Status:</strong> Disabled (Access Concluded)</div>
        <div>&bull; <strong>Session Invalidation:</strong> All active sessions revoked</div>
        <div>&bull; <strong>Token Revocation:</strong> Connected product tokens invalidated</div>
      </div>
      <div style="border-top: 1px solid #ECE7DD; padding-top: 18px; font-size: 12.5px; color: #7A8290; line-height: 1.5;">
        Thank you for your contributions to university student societies.
      </div>"""

    html = build_institutional_html(subject, "LIFECYCLE NOTICE", inner_html)
    return _dispatch_in_background(to_email, subject, text_content, html) if background else send_email(to_email, subject, text_content, html)


# ==============================================================================
# 8. MARKED AS LEFT BY ADMINISTRATOR
# ==============================================================================

def send_marked_as_left_email(to_email: str, name: str, background: bool = True) -> bool:
    subject = "Notice: Campus Society Access Concluded by Administrator"
    text_content = f"""Hello {name},

This notice is to inform you that your campus society membership in Real Access has been marked as left by an administrator.

All active single sign-on sessions and club tokens have been revoked immediately.

Sincerely,
University Administration & Team Sankalp"""

    inner_html = f"""
      <h2 style="margin: 0 0 16px 0; font-size: 21px; font-weight: 600; color: #9B3A22; font-family: Georgia, serif;">Access Concluded</h2>
      <p style="margin: 0 0 16px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Hello <strong>{name}</strong>,
      </p>
      <p style="margin: 0 0 20px 0; font-size: 14.5px; line-height: 1.6; color: #4A5260;">
        Your university society membership has been officially updated to <strong>Marked as Left</strong> by an administrator. All active single sign-on privileges have concluded.
      </p>
      <div style="border-top: 1px solid #ECE7DD; padding-top: 18px; font-size: 12.5px; color: #7A8290; line-height: 1.5;">
        If you have questions regarding this change, please contact your university society supervisor.
      </div>"""

    html = build_institutional_html(subject, "ADMIN NOTICE", inner_html)
    return _dispatch_in_background(to_email, subject, text_content, html) if background else send_email(to_email, subject, text_content, html)
