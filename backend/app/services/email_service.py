import os
import smtplib
import ssl
import logging
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

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

    clean_pass = SMTP_PASS.strip() if SMTP_PASS else ""

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


def build_password_reset_email(name: str, reset_link: str, reset_token: str) -> tuple[str, str]:
    """Generate both plain-text and HTML formatted password reset templates."""
    greeting_name = name.strip() if name and name.strip() else "Member"

    text_content = f"""Hello {greeting_name},

We received a request to reset your password for your Real Access account.

To reset your password, please open the following link in your browser:
{reset_link}

Alternatively, you can manually enter your verification token:
{reset_token}

Security Note:
- This reset link and token expire in 15 minutes.
- If you did not request a password reset, no further action is required. Your account remains secure.

Best regards,
Team Sankalp & Real Access Security Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3EFE7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #12171E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F3EFE7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2DCCF; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #12171E; padding: 28px 36px; text-align: left;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid #D9822B; position: relative; text-align: center; line-height: 28px;">
                      <span style="color: #D9822B; font-weight: bold; font-size: 16px;">&bull;</span>
                    </div>
                  </td>
                  <td style="padding-left: 12px; vertical-align: middle;">
                    <span style="color: #F5F1E8; font-size: 20px; font-weight: 600; letter-spacing: 0.3px; font-family: Georgia, serif;">Real Access</span>
                    <span style="color: #D9822B; font-size: 11px; font-weight: 700; margin-left: 8px; letter-spacing: 1.5px; text-transform: uppercase;">SECURITY</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 600; color: #12171E; font-family: Georgia, serif;">Password Reset Request</h2>
              <p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.6; color: #4A5260;">
                Hello <strong>{greeting_name}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4A5260;">
                We received a request to reset your password for your Real Access single sign-on account. Click the button below to choose a new password:
              </p>

              <!-- Action Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 26px 0;">
                <tr>
                  <td style="border-radius: 8px; background-color: #D9822B;">
                    <a href="{reset_link}" target="_blank" style="display: inline-block; padding: 13px 28px; font-size: 14px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 8px; letter-spacing: 0.2px;">
                      Reset Password &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #5A6270;">
                Or copy and paste this link into your browser:
              </p>
              <div style="background-color: #F9F7F3; border: 1px solid #E6E0D4; border-radius: 6px; padding: 10px 14px; margin-bottom: 24px; word-break: break-all; font-size: 12px; color: #8A4A0F; font-family: monospace;">
                {reset_link}
              </div>

              <!-- Verification Code box -->
              <div style="background-color: #F3EFE7; border-left: 4px solid #D9822B; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 6px 6px 0;">
                <div style="font-size: 12px; font-weight: 600; color: #8A4A0F; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Verification Token</div>
                <div style="font-family: monospace; font-size: 13px; color: #12171E; font-weight: bold; word-break: break-all;">
                  {reset_token}
                </div>
              </div>

              <div style="border-top: 1px solid #ECE7DD; padding-top: 20px;">
                <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.5; color: #7A8290;">
                  &bull; This link and token are valid for <strong>15 minutes</strong>.
                </p>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #7A8290;">
                  &bull; If you did not request this, please ignore this email or notify your club administrator. Your account is completely secure.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9F7F3; border-top: 1px solid #E6E0D4; padding: 18px 36px; text-align: center;">
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
</html>
"""
    return text_content, html_content


def send_password_reset_email(
    to_email: str,
    name: str,
    reset_token: str,
    reset_link: str,
    background: bool = True
) -> bool:
    """
    Sends password reset email. If background is True, runs in a detached daemon thread
    so user HTTP request completes instantly without waiting for network round-trips.
    """
    subject = "Reset your Real Access password"
    text_content, html_content = build_password_reset_email(name, reset_link, reset_token)

    if background:
        thread = threading.Thread(
            target=send_email,
            args=(to_email, subject, text_content, html_content),
            daemon=True
        )
        thread.start()
        logger.info("Dispatched background password reset email to %s", to_email)
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
    subject = "⚠️ Notice: Access Revoked by Administrator — 48-Hour Purge Window"
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
    subject = "⚠️ Notice: Activity Limit / Membership Expired — 48-Hour Purge Window"
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
    subject = "✅ Your Access Renewal Request has been Approved!" if status.lower() == "approved" else "❌ Update: Your Access Renewal Request was Declined"
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
    subject = "📦 Your Personal Data Export & Notice of Permanent Database Purge"
    text_content, html_content = build_final_purge_takeout_email(user_data)
    if background:
        thread = threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True)
        thread.start()
        logger.info("Dispatched final purge takeout email to %s", to_email)
        return True
    return send_email(to_email, subject, text_content, html_content)
