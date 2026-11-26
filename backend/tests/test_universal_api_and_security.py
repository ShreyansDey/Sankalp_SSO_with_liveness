from datetime import datetime, timedelta
import base64
from app.models import AdminOtpToken, ApiKey, AuthCode, Invite, Product, RefreshToken, SsoSession, SystemBootstrap, User
from app.security import compute_pkce_s256, create_signed_ticket, hash_password, hash_token
from app.services.email_service import build_password_changed_email, build_renewal_status_email
from app.middleware.security import rate_limiter


VALID_JPEG_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/" + ("A" * 80)
VALID_PDF_B64 = "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4\n%EOF\n").decode("ascii")


def test_first_time_superuser_bootstrap_and_lock(client, db_session):
    rate_limiter.reset()
    db_session.query(SystemBootstrap).delete()
    db_session.query(User).filter(User.role == "admin").delete()
    db_session.commit()
    # 1. Fresh system status requires bootstrap and primary key
    st = client.get("/api/v1/setup/status").json()
    assert st["needs_bootstrap"] is True
    assert st["primary_key_configured"] is False

    # 2. Cannot bootstrap before primary key is configured
    pre_res = client.post(
        "/api/v1/setup/bootstrap-superuser",
        json={
            "primary_key": "MyUltraSecretPrimaryKey#2026",
            "name": "Owner",
            "email": "owner@sankalp.edu",
            "password": "StrongPassword123!",
        },
    )
    assert pre_res.status_code == 403
    assert pre_res.json()["error"] == "primary_key_not_configured"

    # 3. User configures custom Primary Key + Bootstrap Username/Password & gets initial API key
    cfg_res = client.post(
        "/api/v1/setup/configure-primary-key",
        json={
            "primary_key": "UserDefinedPrimaryKey-2026!",
            "bootstrap_username": "root-setup",
            "bootstrap_password": "BootPassword99!",
            "issue_api_key": True,
            "api_key_name": "Bootstrap CLI Key",
            "scopes": ["*"],
        },
    )
    assert cfg_res.status_code == 200
    cfg_data = cfg_res.json()
    assert cfg_data["primary_key_configured"] is True
    assert cfg_data["requires_bootstrap_credentials"] is True
    assert cfg_data["api_key"].startswith("sk_live_")

    # 4. Wrong primary key or wrong bootstrap password blocked
    bad_pk = client.post(
        "/api/v1/setup/bootstrap-superuser",
        json={
            "primary_key": "WrongKey123456",
            "bootstrap_username": "root-setup",
            "bootstrap_password": "BootPassword99!",
            "name": "Root Admin",
            "email": "super@sankalp.edu",
            "password": "AdminPassword99!",
        },
    )
    assert bad_pk.status_code == 401
    assert bad_pk.json()["error"] == "invalid_primary_key"

    bad_creds = client.post(
        "/api/v1/setup/bootstrap-superuser",
        json={
            "primary_key": "UserDefinedPrimaryKey-2026!",
            "bootstrap_username": "root-setup",
            "bootstrap_password": "WrongBootPassword",
            "name": "Root Admin",
            "email": "super@sankalp.edu",
            "password": "AdminPassword99!",
        },
    )
    assert bad_creds.status_code == 401
    assert bad_creds.json()["error"] == "invalid_bootstrap_credentials"

    # 5. Correct Primary Key + Bootstrap credentials create first Super Admin
    ok_res = client.post(
        "/api/v1/setup/bootstrap-superuser",
        json={
            "primary_key": "UserDefinedPrimaryKey-2026!",
            "bootstrap_username": "root-setup",
            "bootstrap_password": "BootPassword99!",
            "name": "Root Super Admin",
            "email": "super@sankalp.edu",
            "password": "AdminPassword99!",
            "issue_api_key": True,
        },
    )
    assert ok_res.status_code == 200
    ok_data = ok_res.json()
    assert ok_data["role"] == "admin"
    assert ok_data["next"] == "liveness"
    assert "login_ticket" in ok_data
    assert ok_data["api_key"].startswith("sk_live_")

    # 6. Second bootstrap attempt is permanently locked (409)
    replay = client.post(
        "/api/v1/setup/bootstrap-superuser",
        json={
            "primary_key": "UserDefinedPrimaryKey-2026!",
            "bootstrap_username": "root-setup",
            "bootstrap_password": "BootPassword99!",
            "name": "Attacker Admin",
            "email": "attacker@sankalp.edu",
            "password": "AdminPassword99!",
        },
    )
    assert replay.status_code == 409
    assert replay.json()["error"] == "setup_already_completed"

    # 7. Superuser can immediately complete liveness using returned login_ticket
    ch = client.post(
        "/liveness/challenge",
        json={"user_id": ok_data["user_id"], "login_ticket": ok_data["login_ticket"]},
    ).json()
    lv = client.post(
        "/liveness/result",
        json={
            "challenge_id": ch["challenge_id"],
            "code": ch["code"],
            "passed": True,
            "login_ticket": ok_data["login_ticket"],
        },
    )
    assert lv.status_code == 200
    assert lv.json()["passed"] is True


def test_universal_integration_api_pkce_introspect_and_revoke(client, db_session):
    rate_limiter.reset()
    admin = User(
        email="apiadmin@sankalp.edu",
        name="API Admin",
        password_hash=hash_password("Pass1234!"),
        role="admin",
        status="active",
    )
    member = User(
        email="ext_user@sankalp.edu",
        name="External Member",
        password_hash=hash_password("Pass1234!"),
        role="member",
        status="active",
    )
    db_session.add_all([admin, member])
    db_session.commit()

    admin_sess = SsoSession(
        user_id=admin.id,
        expires_at=datetime.utcnow() + timedelta(hours=8),
    )
    member_sess = SsoSession(
        user_id=member.id,
        expires_at=datetime.utcnow() + timedelta(hours=8),
    )
    db_session.add_all([admin_sess, member_sess])
    db_session.commit()

    # Discovery endpoints
    oidc = client.get("/.well-known/openid-configuration")
    assert oidc.status_code == 200
    assert "introspection_endpoint" in oidc.json()
    assert "S256" in oidc.json()["code_challenge_methods_supported"]

    disc = client.get("/api/v1/integrations/discovery")
    assert disc.status_code == 200
    assert disc.json()["version"] == "2.0.0"

    # Create read-only API key and full API key via admin session
    client.cookies.set("sso_session", admin_sess.id)
    readonly_key = client.post(
        "/api/v1/keys",
        json={"name": "Readonly Audit Reader", "scopes": ["sso:read"]},
    ).json()["api_key"]
    full_key = client.post(
        "/api/v1/keys",
        json={"name": "Full SaaS Connector", "scopes": ["*"]},
    ).json()["api_key"]
    client.cookies.clear()

    # Read-only key cannot register apps (403 insufficient_scope)
    denied_app = client.post(
        "/api/v1/integrations/apps",
        headers={"X-API-Key": readonly_key},
        json={"name": "Blocked App", "redirect_uri": "https://app.example.org/cb"},
    )
    assert denied_app.status_code == 403
    assert denied_app.json()["error"] == "insufficient_scope"

    # Full key registers external app
    app_res = client.post(
        "/api/v1/integrations/apps",
        headers={"X-API-Key": full_key},
        json={"name": "External HR SaaS", "redirect_uri": "https://hr.example.org/sso/callback"},
    )
    assert app_res.status_code == 200
    app_info = app_res.json()
    cid, csec, app_id = app_info["client_id"], app_info["client_secret"], app_info["id"]

    # PKCE S256 Authorization Code flow
    verifier = "my_very_long_high_entropy_code_verifier_value_1234567890"
    challenge = compute_pkce_s256(verifier)
    client.cookies.set("sso_session", member_sess.id)
    auth_res = client.get(
        f"/authorize?client_id={cid}&redirect_uri=https://hr.example.org/sso/callback"
        f"&state=csrf123&code_challenge={challenge}&code_challenge_method=S256",
        follow_redirects=False,
    )
    client.cookies.clear()
    assert auth_res.status_code == 302
    loc = auth_res.headers["location"]
    code = loc.split("code=")[1].split("&")[0]

    # Unsupported grant_type rejected
    bad_grant = client.post(
        "/token",
        json={"grant_type": "password", "code": code, "client_id": cid, "client_secret": csec},
    )
    assert bad_grant.status_code == 400
    assert bad_grant.json()["error"] == "unsupported_grant_type"

    # PKCE wrong verifier rejected (note: auth_code was atomically consumed or check verifier before consuming? Let's test fresh code)
    # Get fresh code for mismatch test
    client.cookies.set("sso_session", member_sess.id)
    auth_res2 = client.get(
        f"/authorize?client_id={cid}&redirect_uri=https://hr.example.org/sso/callback"
        f"&code_challenge={challenge}&code_challenge_method=S256",
        follow_redirects=False,
    )
    client.cookies.clear()
    code2 = auth_res2.headers["location"].split("code=")[1].split("&")[0]
    bad_pkce = client.post(
        "/token",
        json={
            "grant_type": "authorization_code",
            "code": code2,
            "client_id": cid,
            "client_secret": csec,
            "code_verifier": "wrong_verifier",
        },
    )
    assert bad_pkce.status_code == 400
    assert bad_pkce.json()["error"] == "invalid_pkce"

    # Valid PKCE code exchange
    tok_res = client.post(
        "/token",
        json={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": cid,
            "client_secret": csec,
            "code_verifier": verifier,
        },
    )
    assert tok_res.status_code == 200
    access_jwt = tok_res.json()["access_token"]
    refresh_tok = tok_res.json()["refresh_token"]

    # Introspection confirms active token
    intro = client.post(
        "/token/introspect",
        headers={"X-API-Key": readonly_key},
        json={"token": access_jwt},
    )
    assert intro.status_code == 200
    assert intro.json()["active"] is True
    assert intro.json()["email"] == "ext_user@sankalp.edu"

    # Secret rotation invalidates old secret immediately
    rot = client.post(
        f"/api/v1/integrations/apps/{app_id}/rotate-secret",
        headers={"X-API-Key": full_key},
    )
    assert rot.status_code == 200
    new_csec = rot.json()["client_secret"]
    old_ref = client.post(
        "/token/refresh",
        json={"refresh_token": refresh_tok, "client_id": cid, "client_secret": csec},
    )
    assert old_ref.status_code == 401
    new_ref = client.post(
        "/token/refresh",
        json={"refresh_token": refresh_tok, "client_id": cid, "client_secret": new_csec},
    )
    assert new_ref.status_code == 200

    # API-driven kill-switch disables member and makes introspection active=False
    rev = client.post(
        f"/api/v1/integrations/users/{member.id}/revoke",
        headers={"X-API-Key": full_key},
    )
    assert rev.status_code == 200
    intro_after = client.post(
        "/token/introspect",
        headers={"X-API-Key": readonly_key},
        json={"token": access_jwt},
    )
    assert intro_after.json()["active"] is False

    # Revoke API key stops further calls
    key_id = next(k["id"] for k in client.get("/api/v1/keys", headers={"X-API-Key": full_key}).json() if k["name"] == "Readonly Audit Reader")
    del_key = client.delete(f"/api/v1/keys/{key_id}", headers={"X-API-Key": full_key})
    assert del_key.status_code == 200
    assert client.get("/api/v1/integrations/audit", headers={"X-API-Key": readonly_key}).status_code == 401


def test_vulnerability_regressions_cors_redirect_upload_failclosed_otp_xss(client, db_session, monkeypatch):
    rate_limiter.reset()

    # 1. Strict CORS blocks arbitrary origin
    cors_res = client.options("/auth/login", headers={"Origin": "https://attacker-evil.com", "Access-Control-Request-Method": "POST"})
    assert cors_res.headers.get("access-control-allow-origin") != "https://attacker-evil.com"

    # 2. Strict redirect URI blocks ngrok/port spoofing
    prod = Product(
        name="Trusted App",
        client_id="trusted-app",
        client_secret_hash=hash_token("sec123"),
        redirect_uri="http://localhost:5174/callback",
    )
    db_session.add(prod)
    db_session.commit()
    for bad_uri in [
        "https://attacker.ngrok-free.app/callback",
        "http://evil.com:5174/callback",
        "javascript:alert(1)",
    ]:
        r = client.get(f"/authorize?client_id=trusted-app&redirect_uri={bad_uri}")
        assert r.status_code == 400
        assert r.json()["error"] == "invalid_redirect_uri"

    # 3. Direct signup blocked without invite_token
    uninvited = client.post(
        "/auth/signup",
        json={"email": "rando@evil.com", "name": "Rando", "password": "Password123!", "consent_given": True},
    )
    assert uninvited.status_code == 403
    assert uninvited.json()["error"] == "invite_required"

    # 4. Malicious polyglot HTML upload rejected on /auth/register
    polyglot = "data:image/jpeg;base64," + base64.b64encode(b"<script>alert('xss')</script>").decode("ascii")
    bad_upload = client.post(
        "/auth/register",
        json={
            "email": "poly@sankalp.edu",
            "name": "Poly",
            "phone": "+919999999999",
            "password": "Password123!",
            "face_photo": polyglot,
            "document_base64": VALID_PDF_B64,
            "consent_given": True,
        },
    )
    assert bad_upload.status_code == 400
    assert bad_upload.json()["error"] == "invalid_upload"

    # 5. Disabled user session denied on /auth/me and /me
    u = User(
        email="disabled_me@sankalp.edu",
        name="Disabled Me",
        password_hash=hash_password("Pass1234!"),
        role="member",
        status="disabled",
    )
    db_session.add(u)
    db_session.commit()
    sess = SsoSession(user_id=u.id, expires_at=datetime.utcnow() + timedelta(hours=2))
    db_session.add(sess)
    db_session.commit()
    client.cookies.set("sso_session", sess.id)
    assert client.get("/auth/me").status_code == 403
    assert client.get("/me").status_code == 403
    client.cookies.clear()

    # 6. Fail-closed biometrics: 503 if face engine unavailable on face-locked user
    face_user = User(
        email="facelocked@sankalp.edu",
        name="Face Locked",
        password_hash=hash_password("Pass1234!"),
        role="member",
        status="active",
        require_face_match=True,
        face_embedding=[0.1] * 128,
    )
    db_session.add(face_user)
    db_session.commit()
    ticket = create_signed_ticket(face_user.id, purpose="liveness")
    ch = client.post("/liveness/challenge", json={"user_id": face_user.id, "login_ticket": ticket}).json()
    import app.routes.liveness as liveness_mod
    monkeypatch.setattr(liveness_mod, "is_face_engine_ready", lambda: False)
    fail_closed = client.post(
        "/liveness/result",
        json={
            "challenge_id": ch["challenge_id"],
            "code": ch["code"],
            "passed": True,
            "live_frame": VALID_JPEG_B64,
            "login_ticket": ticket,
        },
    )
    assert fail_closed.status_code == 503
    assert fail_closed.json()["error"] == "biometric_engine_unavailable"

    # 7. DB-backed OTP 5-attempt lockout
    adm = User(
        email="otpadmin@sankalp.edu",
        name="OTP Admin",
        password_hash=hash_password("Pass1234!"),
        role="admin",
        status="active",
        require_face_match=True,
        admin_faces=[{"id": "f1", "label": "cam", "embedding": [0.1] * 128}],
    )
    db_session.add(adm)
    db_session.commit()
    adm_sess = SsoSession(user_id=adm.id, expires_at=datetime.utcnow() + timedelta(hours=2))
    db_session.add(adm_sess)
    db_session.commit()
    client.cookies.set("sso_session", adm_sess.id)
    captured = {}
    import app.routes.admin_facelock as flock_mod
    monkeypatch.setattr(flock_mod, "send_disable_face_lock_otp_email", lambda **kw: captured.update(otp=kw["otp_code"]) or True)
    assert client.post("/admin/face-profiles/request-disable-otp").status_code == 200
    for _ in range(5):
        r = client.post("/admin/face-profiles/verify-disable-otp", json={"otp": "999999"})
        assert r.status_code == 400
    locked_res = client.post("/admin/face-profiles/verify-disable-otp", json={"otp": captured["otp"]})
    assert locked_res.status_code == 400
    assert locked_res.json()["error"] == "no_active_otp"

    # 8. HTML XSS escaping in email builders
    _, html_pw = build_password_changed_email("<script>alert(1)</script>", "1.2.3.4", "<img onerror=alert(1)>", "now")
    assert "<script>alert(1)</script>" not in html_pw
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html_pw
    _, html_ren = build_renewal_status_email("<b>Bob</b>", "approved", "<script>evil()</script>")
    assert "<script>evil()</script>" not in html_ren
    assert "&lt;script&gt;evil()&lt;/script&gt;" in html_ren
