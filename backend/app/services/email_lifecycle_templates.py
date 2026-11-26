import html
import logging
import threading
from datetime import date
from typing import Optional
from app.config import EMAIL_FROM, SMTP_USER
from app.services.email_service import (
    _dispatch_in_background,
    render_email_template,
    send_email,
)

logger = logging.getLogger("sankalp.email.lifecycle")


def send_expiry_warning_email(
    to_email: str,
    name: str,
    term_end_str: str,
    days_left: int = 3,
    org_name: Optional[str] = None,
    role: str = "Member",
    admin_email: Optional[str] = None,
    background: bool = True,
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    adm_email = admin_email or SMTP_USER or "admin@college.edu"
    subject = f"A short reminder: {days_left} days left of access — {target_org}"
    text_content = (
        f"Hello {name},\n\n"
        f"You have {days_left} days left until your access to {target_org} closes.\n"
        f"Access ends: {term_end_str}\nRole: {role}\n\n"
        "Ask your admin to extend your term before that date.\n"
        "Best regards,\nAutomated Lifecycle Daemon & Team Sankalp"
    )
    html_body, assets = render_email_template(
        "term_ending.html",
        {
            "name": name,
            "org_name": target_org,
            "days_left": str(days_left),
            "term_end": term_end_str,
            "role": role,
            "admin_email": adm_email,
        },
    )
    return (
        _dispatch_in_background(to_email, subject, text_content, html_body, assets)
        if background
        else send_email(to_email, subject, text_content, html_body, assets)
    )


def send_account_expired_email(
    to_email: str,
    name: str,
    reason: str = "term_end",
    org_name: Optional[str] = None,
    admin_email: Optional[str] = None,
    background: bool = True,
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    adm_email = admin_email or EMAIL_FROM or SMTP_USER or "admin@college.edu"
    subject = f"Your access has ended — {target_org}"
    reason_label = "Term expired" if reason == "term_end" else "Inactivity (60 days)"
    text_content = (
        f"Hello {name},\n\nYour access to {target_org} was closed, and you have been signed out.\n"
        f"Reason: {reason_label}\nSincerely,\nAutomated Lifecycle Daemon & Team Sankalp"
    )
    ended_on_str = date.today().strftime("%d %b %Y")
    html_body, assets = render_email_template(
        "access_ended.html",
        {"name": name, "org_name": target_org, "reason": reason_label, "ended_on": ended_on_str, "admin_email": adm_email},
    )
    return (
        _dispatch_in_background(to_email, subject, text_content, html_body, assets)
        if background
        else send_email(to_email, subject, text_content, html_body, assets)
    )


def send_marked_as_left_email(
    to_email: str,
    name: str,
    org_name: Optional[str] = None,
    admin_email: Optional[str] = None,
    background: bool = True,
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    adm_email = admin_email or EMAIL_FROM or SMTP_USER or "admin@college.edu"
    subject = f"Your access has ended — {target_org}"
    ended_on_str = date.today().strftime("%d %b %Y")
    text_content = (
        f"Hello {name},\n\nYour access to {target_org} was closed.\n"
        "Reason: Left the club (Administrator action)\nSincerely,\nUniversity Administration & Team Sankalp"
    )
    html_body, assets = render_email_template(
        "access_ended.html",
        {"name": name, "org_name": target_org, "reason": "Left the club", "ended_on": ended_on_str, "admin_email": adm_email},
    )
    return (
        _dispatch_in_background(to_email, subject, text_content, html_body, assets)
        if background
        else send_email(to_email, subject, text_content, html_body, assets)
    )


def build_mark_as_left_email(name: str, renew_url: str) -> tuple[str, str]:
    greeting_name = name.strip() if name and name.strip() else "Member"
    safe_name = html.escape(greeting_name)
    safe_url = html.escape(renew_url, quote=True)

    text_content = (
        f"Hello {greeting_name},\n\n"
        "Notice: An administrator has revoked your access permissions across all connected applications (Mark as Left).\n\n"
        f"48-HOUR RENEWAL & PURGE NOTICE:\nYou may apply to renew within 48 hours at:\n{renew_url}\n\n"
        "If no renewal is approved within 48 hours, all your credential data will be COMPLETELY PURGED.\n"
        "— Team Sankalp (Real Person, Real Access SSO)\n"
    )
    html_content = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Access Revoked — 48-Hour Purge Notice</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAFAF7;margin:0;padding:24px;color:#1C1917;">
  <table width="100%" style="max-width:600px;margin:0 auto;background:#FFF;border:1px solid #E7E5E4;border-radius:8px;overflow:hidden;">
    <tr><td style="padding:24px 32px;background:#0F172A;color:#FFF;"><h2 style="margin:0;font-size:20px;">Sankalp SSO &bull; Real Access</h2><p style="margin:4px 0 0;font-size:13px;color:#94A3B8;">Security Notification &bull; Access Revoked</p></td></tr>
    <tr><td style="padding:32px;">
      <p style="font-size:16px;">Hello <strong>{safe_name}</strong>,</p>
      <p style="font-size:14px;line-height:1.6;color:#44403C;">An administrator has revoked your access permissions across all connected applications (status set to <em>Mark as Left</em>).</p>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:16px;margin:20px 0;">
        <h4 style="margin:0 0 8px;color:#B45309;font-size:14px;">48-Hour Recovery Window Active</h4>
        <p style="margin:0;font-size:13px;color:#92400E;">If not renewed within 48 hours, all your credential data and account records will be COMPLETELY PURGED.</p>
      </div>
      <div style="text-align:center;margin:28px 0;"><a href="{safe_url}" style="background:#0F172A;color:#FFF;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Apply for Access Renewal</a></div>
    </td></tr>
  </table>
</body></html>"""
    return text_content, html_content


def build_expired_email(name: str, renew_url: str, reason: str = "term_end") -> tuple[str, str]:
    greeting_name = name.strip() if name and name.strip() else "Member"
    safe_name = html.escape(greeting_name)
    safe_url = html.escape(renew_url, quote=True)
    reason_label = (
        "membership term has reached its end date"
        if reason == "term_end"
        else "account has been inactive for over 60 days"
    )
    text_content = (
        f"Hello {greeting_name},\n\n"
        f"Notice: Your access through Sankalp SSO has expired because your {reason_label}.\n"
        f"Apply for renewal within 48 hours: {renew_url}\n\n"
        "Otherwise, all your credential data will be COMPLETELY PURGED.\n"
        "— Team Sankalp (Real Person, Real Access SSO)\n"
    )
    html_content = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Activity Limit Expired — 48-Hour Purge Notice</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAFAF7;margin:0;padding:24px;color:#1C1917;">
  <table width="100%" style="max-width:600px;margin:0 auto;background:#FFF;border:1px solid #E7E5E4;border-radius:8px;overflow:hidden;">
    <tr><td style="padding:24px 32px;background:#0F172A;color:#FFF;"><h2 style="margin:0;font-size:20px;">Sankalp SSO &bull; Real Access</h2><p style="margin:4px 0 0;font-size:13px;color:#94A3B8;">Security Notification &bull; Access Expired</p></td></tr>
    <tr><td style="padding:32px;">
      <p style="font-size:16px;">Hello <strong>{safe_name}</strong>,</p>
      <p style="font-size:14px;line-height:1.6;color:#44403C;">Your access permissions through Sankalp SSO have expired because your <strong>{html.escape(reason_label)}</strong>.</p>
      <div style="text-align:center;margin:28px 0;"><a href="{safe_url}" style="background:#0F172A;color:#FFF;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Apply for Membership Renewal</a></div>
    </td></tr>
  </table>
</body></html>"""
    return text_content, html_content


def build_renewal_status_email(name: str, status: str, admin_notes: Optional[str] = None) -> tuple[str, str]:
    greeting_name = name.strip() if name and name.strip() else "Member"
    safe_name = html.escape(greeting_name)
    is_approved = status.lower() == "approved"

    if is_approved:
        subject_line = "Access Restored — Your Renewal Request was Approved"
        headline = "Renewal Request Approved!"
        header_color = "#047857"
        body_text = "Good news! An administrator has approved your access renewal request and reactivated your account."
    else:
        subject_line = "Update: Your Access Renewal Request was Declined"
        headline = "Renewal Request Declined"
        header_color = "#B91C1C"
        body_text = "Your renewal request was declined by an administrator. Your account records remain scheduled for purge."

    notes_section_txt = f"\nAdministrator Notes: {admin_notes}\n" if admin_notes else ""
    safe_notes = html.escape(admin_notes) if admin_notes else ""
    notes_section_html = (
        f'<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px;margin:16px 0;">'
        f"<strong>Administrator Notes:</strong> {safe_notes}</div>"
        if safe_notes
        else ""
    )

    text_content = f"Hello {greeting_name},\n\n{subject_line}\n\n{body_text}{notes_section_txt}\n— Team Sankalp\n"
    html_content = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{html.escape(subject_line)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAFAF7;margin:0;padding:24px;color:#1C1917;">
  <table width="100%" style="max-width:600px;margin:0 auto;background:#FFF;border:1px solid #E7E5E4;border-radius:8px;overflow:hidden;">
    <tr><td style="padding:24px 32px;background:{header_color};color:#FFF;"><h2 style="margin:0;font-size:20px;">{headline}</h2></td></tr>
    <tr><td style="padding:32px;"><p style="font-size:16px;">Hello <strong>{safe_name}</strong>,</p><p style="font-size:14px;color:#44403C;">{body_text}</p>{notes_section_html}</td></tr>
  </table>
</body></html>"""
    return text_content, html_content


def send_mark_as_left_email(to_email: str, name: str, renew_url: str, background: bool = True) -> bool:
    subject = "Sankalp SSO: Notice of Account Deactivation & 48-Hour Recovery Window"
    text_content, html_content = build_mark_as_left_email(name, renew_url)
    if background:
        threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True).start()
        return True
    return send_email(to_email, subject, text_content, html_content)


def send_expired_email(
    to_email: str, name: str, renew_url: str, reason: str = "term_end", background: bool = True
) -> bool:
    subject = "Sankalp SSO: Notice of Membership Expiration & 48-Hour Recovery Window"
    text_content, html_content = build_expired_email(name, renew_url, reason)
    if background:
        threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True).start()
        return True
    return send_email(to_email, subject, text_content, html_content)


def send_renewal_status_email(
    to_email: str, name: str, status: str, admin_notes: Optional[str] = None, background: bool = True
) -> bool:
    subject = (
        "Sankalp SSO: Access Renewal Request Approved"
        if status.lower() == "approved"
        else "Sankalp SSO: Access Renewal Request Status Update"
    )
    text_content, html_content = build_renewal_status_email(name, status, admin_notes)
    if background:
        threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True).start()
        return True
    return send_email(to_email, subject, text_content, html_content)


def build_final_purge_takeout_email(user_data: dict) -> tuple[str, str]:
    name = (user_data.get("name") or "Member").strip()
    email = user_data.get("email") or "N/A"
    phone = user_data.get("phone") or "Not provided"
    created_at = user_data.get("created_at")
    disabled_at = user_data.get("disabled_at")
    reason = user_data.get("disabled_reason") or "left"

    created_str = created_at.strftime("%Y-%m-%d %H:%M UTC") if hasattr(created_at, "strftime") else str(created_at or "N/A")
    disabled_str = disabled_at.strftime("%Y-%m-%d %H:%M UTC") if hasattr(disabled_at, "strftime") else str(disabled_at or "N/A")

    reason_desc = (
        "Administrative Revocation (Mark as Left)"
        if reason == "left"
        else "Membership Term Expiration"
        if reason == "term_end"
        else "60-Day Account Inactivity"
        if reason == "inactive"
        else reason
    )

    text_content = (
        f"Hello {name},\n\n"
        "FINAL DATA TAKEOUT & COMPLETE DATABASE PURGE NOTICE:\n"
        "Your 48-hour recovery window has completed. All your credential records, authentication profiles, "
        "128D embeddings, and ID files have been PERMANENTLY PURGED.\n\n"
        f"• Full Name: {name}\n• Registered Email: {email}\n• Contact Phone: {phone}\n"
        f"• Account Enrolled On: {created_str}\n• Deactivation Date: {disabled_str}\n"
        f"• Deactivation Reason: {reason_desc}\n\n"
        "— Team Sankalp (Real Person, Real Access SSO)\n"
    )
    html_content = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Final Data Takeout & Complete Database Purge Notice</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAFAF7;margin:0;padding:24px;color:#1C1917;">
  <table width="100%" style="max-width:620px;margin:0 auto;background:#FFF;border:1px solid #E7E5E4;border-radius:8px;overflow:hidden;">
    <tr><td style="padding:24px 32px;background:#0F172A;color:#FFF;"><h2 style="margin:0;font-size:20px;">Sankalp SSO &bull; Real Access</h2><p style="margin:4px 0 0;font-size:13px;color:#94A3B8;">Final Data Takeout &bull; Permanent Database Purge Notice</p></td></tr>
    <tr><td style="padding:32px;">
      <p style="font-size:16px;">Hello <strong>{html.escape(name)}</strong>,</p>
      <p style="font-size:14px;color:#44403C;">All your credential records, session tokens, 128D embeddings, and identity documents have been <strong>COMPLETELY AND PERMANENTLY PURGED</strong>.</p>
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin:20px 0;">
        <h4 style="margin:0 0 12px;font-size:14px;color:#0F172A;text-transform:uppercase;">Final Personal Data Export (Takeout)</h4>
        <table width="100%" style="font-size:13px;color:#334155;line-height:1.6;">
          <tr><td style="font-weight:600;width:160px;">Full Name:</td><td>{html.escape(name)}</td></tr>
          <tr><td style="font-weight:600;">Institutional Email:</td><td>{html.escape(str(email))}</td></tr>
          <tr><td style="font-weight:600;">Contact Phone:</td><td>{html.escape(str(phone))}</td></tr>
          <tr><td style="font-weight:600;">Account Created:</td><td>{html.escape(created_str)}</td></tr>
          <tr><td style="font-weight:600;">Deactivation Date:</td><td>{html.escape(disabled_str)}</td></tr>
          <tr><td style="font-weight:600;">Deactivation Reason:</td><td>{html.escape(reason_desc)}</td></tr>
        </table>
      </div>
    </td></tr>
  </table>
</body></html>"""
    return text_content, html_content


def send_final_purge_takeout_email(to_email: str, user_data: dict, background: bool = True) -> bool:
    subject = "Sankalp SSO: Personal Data Export & Notice of Permanent Database Purge"
    text_content, html_content = build_final_purge_takeout_email(user_data)
    if background:
        threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True).start()
        return True
    return send_email(to_email, subject, text_content, html_content)
