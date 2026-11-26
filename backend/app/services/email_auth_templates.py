import html
import logging
import threading
from typing import List, Optional, Tuple
from app.config import ADMIN_CONTACT_EMAIL, EMAIL_FROM, FRONTEND_ORIGIN, SMTP_USER
from app.services.email_service import (
    _dispatch_in_background,
    get_ist_now_str,
    render_email_template,
    send_email,
)

logger = logging.getLogger("sankalp.email.auth")


def build_password_reset_email(name: str, reset_link: str, reset_token: str) -> Tuple[str, str, List[str]]:
    greeting_name = name.strip() if name and name.strip() else "Member"
    text_content = (
        f"Hello {greeting_name},\n\n"
        "We received a request to reset your password for your Real Access account.\n\n"
        f"To reset your password, open the following link:\n{reset_link}\n\n"
        f"Verification Token:\n{reset_token}\n\n"
        "Security Note:\n"
        "- This reset link and token expire in 15 minutes.\n"
        "- If you did not request this, no further action is required.\n\n"
        "Best regards,\nTeam Sankalp & Real Access Security Team"
    )
    ctx = {
        "name": greeting_name,
        "reset_url": reset_link,
        "reset_token": reset_token,
        "org_name": "Jadavpur University Societies",
    }
    html_body, assets = render_email_template("password_reset.html", ctx)
    return text_content, html_body, assets


def send_password_reset_email(
    to_email: str, name: str, reset_token: str, reset_link: str, background: bool = True
) -> bool:
    subject = "Reset your Real Access password"
    text, html_body, assets = build_password_reset_email(name, reset_link, reset_token)
    return (
        _dispatch_in_background(to_email, subject, text, html_body, assets)
        if background
        else send_email(to_email, subject, text, html_body, assets)
    )


def build_invite_email(
    invite_link: str,
    role: str,
    term_end: Optional[str] = None,
    name: Optional[str] = None,
    org_name: Optional[str] = None,
    admin_name: Optional[str] = None,
) -> Tuple[str, str, List[str]]:
    target_name = name or "Student"
    target_org = org_name or "Recognized Campus Societies"
    term_str = term_end or "End of Academic Year"
    adm_name = admin_name or "Campus Administration"

    text_content = (
        f"Hello {target_name},\n\n"
        f"You have been invited by {adm_name} to join {target_org} via Real Access Single Sign-On as a {role.capitalize()}.\n"
        f"Your active membership is valid until {term_str}.\n\n"
        f"Set up your account using the link below:\n{invite_link}\n\n"
        "Steps to activate:\n1. Choose a strong password.\n"
        "2. Complete a fast in-browser camera check (blink/head turn).\n"
        "3. Access all connected campus clubs with 1 click.\n\n"
        "This invitation link expires in 48 hours.\n\n"
        "Best regards,\nUniversity Administration & Team Sankalp"
    )
    ctx = {
        "name": target_name,
        "org_name": target_org,
        "admin_name": adm_name,
        "role": role.capitalize(),
        "term_end": term_str,
        "invite_url": invite_link,
        "expires_in": "48 hours",
    }
    html_body, assets = render_email_template("invite.html", ctx)
    return text_content, html_body, assets


def send_invite_email(
    to_email: str,
    invite_link: str,
    role: str = "member",
    term_end: Optional[str] = None,
    name: Optional[str] = None,
    org_name: Optional[str] = None,
    admin_name: Optional[str] = None,
    background: bool = True,
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    subject = f"You have been invited to join {target_org} — Real Access"
    text, html_body, assets = build_invite_email(invite_link, role, term_end, name, org_name, admin_name)
    return (
        _dispatch_in_background(to_email, subject, text, html_body, assets)
        if background
        else send_email(to_email, subject, text, html_body, assets)
    )


def send_application_submitted_emails(
    applicant_name: str,
    applicant_email: str,
    admin_email: Optional[str] = None,
    org_name: Optional[str] = None,
    background: bool = True,
) -> bool:
    target_org = org_name or "Jadavpur University Societies"
    adm_email = admin_email or ADMIN_CONTACT_EMAIL or SMTP_USER or "teamsankalp60@gmail.com"

    student_subject = f"Application Received — {target_org} (Real Access)"
    student_text = (
        f"Hello {applicant_name},\n\n"
        f"Thank you for submitting your membership application to {target_org} via Real Access.\n"
        "Your application and supporting identity documentation have been securely received and are queued for review.\n"
        "In compliance with DPDP 2023, your uploaded ID card file will be permanently erased immediately after review.\n\n"
        "Best regards,\nInstitutional Registration Authority & Team Sankalp"
    )
    student_html, student_assets = render_email_template(
        "application_submitted.html",
        {"name": applicant_name, "org_name": target_org, "admin_email": adm_email},
    )

    admin_subject = f"New Application Pending Review: {applicant_name}"
    admin_text = (
        "Administrator Notice:\n\n"
        "A new member application is awaiting approval in the Real Access Admin Console:\n"
        f"- Name: {applicant_name}\n- Email: {applicant_email}\n\n"
        f"Review URL: {FRONTEND_ORIGIN}/admin"
    )
    admin_html, admin_assets = render_email_template(
        "admin_new_applicant.html",
        {
            "applicant_name": applicant_name,
            "applicant_email": applicant_email,
            "org_name": target_org,
            "review_url": f"{FRONTEND_ORIGIN}/admin",
        },
    )

    if background:
        _dispatch_in_background(applicant_email, student_subject, student_text, student_html, student_assets)
        if adm_email and adm_email != applicant_email:
            _dispatch_in_background(adm_email, admin_subject, admin_text, admin_html, admin_assets)
        return True
    s1 = send_email(applicant_email, student_subject, student_text, student_html, student_assets)
    s2 = (
        send_email(adm_email, admin_subject, admin_text, admin_html, admin_assets)
        if adm_email and adm_email != applicant_email
        else True
    )
    return s1 and s2


def send_application_approved_email(
    to_email: str,
    name: str,
    login_link: Optional[str] = None,
    org_name: Optional[str] = None,
    term_end: Optional[str] = None,
    role: str = "Member",
    background: bool = True,
) -> bool:
    link = login_link or f"{FRONTEND_ORIGIN}/login"
    target_org = org_name or "Recognized Campus Societies"
    term_str = term_end or "End of Academic Session"
    subject = f"Your Access Has Been Approved — {target_org}"
    text_content = (
        f"Hello {name},\n\n"
        f"Your membership application for {target_org} has been approved.\n"
        f"Your account is now ACTIVE with {role} privileges until {term_str}.\n\n"
        f"Sign in here: {link}\n\nWelcome aboard!\nTeam Sankalp & Real Access Registry"
    )
    html_body, assets = render_email_template(
        "application_approved.html",
        {"name": name, "org_name": target_org, "login_url": link, "role": role, "term_end": term_str},
    )
    return (
        _dispatch_in_background(to_email, subject, text_content, html_body, assets)
        if background
        else send_email(to_email, subject, text_content, html_body, assets)
    )


def send_application_rejected_email(
    to_email: str,
    name: str,
    reason: Optional[str] = None,
    org_name: Optional[str] = None,
    admin_email: Optional[str] = None,
    background: bool = True,
) -> bool:
    target_org = org_name or "Recognized Campus Societies"
    adm_email = admin_email or EMAIL_FROM or SMTP_USER or "admin@college.edu"
    subject = f"Update regarding your application — {target_org}"
    reason_str = reason or "Documentation could not be verified by the administrator."
    text_content = (
        f"Hello {name},\n\n"
        f"After review, your membership application for {target_org} could not be approved.\n"
        f"Reason: {reason_str}\n\n"
        "In strict compliance with DPDP Act 2023, all identification documents and portrait photos provided have been permanently erased.\n\n"
        "Sincerely,\nStudent Identity Verification Directorate"
    )
    html_body, assets = render_email_template(
        "application_rejected.html",
        {"name": name, "org_name": target_org, "reason": reason_str, "admin_email": adm_email},
    )
    return (
        _dispatch_in_background(to_email, subject, text_content, html_body, assets)
        if background
        else send_email(to_email, subject, text_content, html_body, assets)
    )


def send_login_alert_email(
    to_email: str,
    name: str,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    timestamp_str: Optional[str] = None,
    org_name: Optional[str] = None,
    background: bool = True,
) -> bool:
    subject = "Security Alert: New Sign-In to Real Access"
    time_display = timestamp_str or "Just now"
    ip_display = ip or "Local network"
    ua_display = (user_agent[:60] + "...") if user_agent and len(user_agent) > 60 else (user_agent or "Web Browser")
    target_org = org_name or "Campus Single Sign-On"

    text_content = (
        f"Hello {name},\n\n"
        "A new login to your Real Access account was verified with live human presence:\n"
        f"- Time: {time_display}\n- IP Address: {ip_display}\n- Device: {ua_display}\n\n"
        f"If not you, reset immediately: {FRONTEND_ORIGIN}/forgot-password"
    )
    html_body, assets = render_email_template(
        "login_alert.html",
        {
            "name": name,
            "org_name": target_org,
            "time_display": time_display,
            "ip_display": ip_display,
            "ua_display": ua_display,
            "reset_url": f"{FRONTEND_ORIGIN}/forgot-password",
        },
    )
    return (
        _dispatch_in_background(to_email, subject, text_content, html_body, assets)
        if background
        else send_email(to_email, subject, text_content, html_body, assets)
    )


def build_password_changed_email(name: str, ip: str, user_agent: str, time_str: str) -> tuple[str, str]:
    greeting = name.strip() if name and name.strip() else "Member"
    safe_greeting = html.escape(greeting)
    safe_time = html.escape(str(time_str))
    safe_ip = html.escape(str(ip))
    safe_ua = html.escape(str(user_agent))

    text_content = (
        f"Hello {greeting},\n\n"
        "Security Notice: The password for your Real Access account was just updated.\n\n"
        f"- Time: {time_str}\n- IP Address: {ip}\n- Device / Browser: {user_agent}\n\n"
        "All existing sessions have been invalidated across connected portals.\n"
        "— Team Sankalp (Real Person, Real Access SSO)\n"
    )
    html_content = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Security Alert: Password Changed</title></head>
<body style="margin:0;padding:24px;background:#F3EFE7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#12171E;">
  <table role="presentation" width="100%" style="max-width:540px;margin:0 auto;background:#FFFFFF;border-radius:12px;border:1px solid #E2DCCF;overflow:hidden;" cellspacing="0" cellpadding="0">
    <tr><td style="background:#12171E;padding:24px 32px;"><span style="color:#F5F1E8;font-size:20px;font-weight:600;">Real Access</span> <span style="color:#D9822B;font-size:11px;font-weight:700;letter-spacing:1.5px;">SECURITY ALERT</span></td></tr>
    <tr><td style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#12171E;">Password Changed Successfully</h2>
      <p style="color:#5A6270;font-size:15px;line-height:1.55;">Hello <strong>{safe_greeting}</strong>, your account password was recently changed and all active login sessions were terminated.</p>
      <div style="background:#FBF9F4;border:1px solid #DDD6C7;border-radius:8px;padding:16px;margin:20px 0;font-size:13.5px;color:#3A4250;">
        <p style="margin:4px 0;"><strong>Time:</strong> {safe_time}</p>
        <p style="margin:4px 0;"><strong>IP Address:</strong> {safe_ip}</p>
        <p style="margin:4px 0;word-break:break-all;"><strong>Device:</strong> {safe_ua}</p>
      </div>
    </td></tr>
  </table>
</body></html>"""
    return text_content, html_content


def send_password_changed_email(
    to_email: str, name: str, ip: str, user_agent: str, background: bool = True
) -> bool:
    time_str = get_ist_now_str()
    subject = "Security Alert: Real Access Password Changed"
    text_content, html_content = build_password_changed_email(name, ip, user_agent, time_str)
    if background:
        threading.Thread(target=send_email, args=(to_email, subject, text_content, html_content), daemon=True).start()
        return True
    return send_email(to_email, subject, text_content, html_content)


def send_disable_face_lock_otp_email(
    to_email: str, admin_name: str, otp_code: str, background: bool = True
) -> bool:
    subject = "Security Action: 2-Step Verification Code — Real Access"
    now_str = get_ist_now_str()
    clean_name = admin_name.strip() if admin_name else "Administrator"
    ctx = {
        "name": clean_name,
        "email": to_email,
        "otp_code": otp_code,
        "timestamp": now_str,
        "org_name": "Jadavpur University Clubs",
        "admin_email": to_email,
    }
    html_content, inline_assets = render_email_template("admin_2fa_otp.html", ctx)
    text_content = (
        f"Confirm Disabling Biometric Face Lock\n\n"
        f"Hello {clean_name},\n"
        f"Your 6-digit verification code: {otp_code}\n\n"
        f"Expires in 5 minutes.\nRequested at: {now_str}\n"
    )
    if background:
        return _dispatch_in_background(to_email, subject, text_content, html_content, inline_assets)
    return send_email(to_email, subject, text_content, html_content, inline_assets)
