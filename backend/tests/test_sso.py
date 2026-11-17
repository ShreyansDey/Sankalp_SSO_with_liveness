from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs
from app.models import User, Product, SsoSession
from app.security import hash_password, hash_token

def test_sso_full_flow(client, db_session):
    # 1. Setup user and product
    user = User(
        email="sso_tester@example.com",
        name="SSO Tester",
        password_hash=hash_password("Pass12345"),
        role="member",
        status="active"
    )
    product = Product(
        name="App Test",
        client_id="app-test",
        client_secret_hash=hash_token("test-secret"),
        redirect_uri="http://localhost:5174/callback"
    )
    db_session.add_all([user, product])
    db_session.commit()

    # 2. Call /authorize without session -> redirects to login page
    res_no_sess = client.get(
        "/authorize?client_id=app-test&redirect_uri=http://localhost:5174/callback&state=mystate",
        follow_redirects=False
    )
    assert res_no_sess.status_code == 302
    assert "/login" in res_no_sess.headers["location"]

    # 3. Create active SSO session
    session_obj = SsoSession(
        user_id=user.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    db_session.add(session_obj)
    db_session.commit()

    # 4. Call /authorize with valid session cookie -> redirects back with code
    client.cookies.set("sso_session", session_obj.id)
    res_sess = client.get(
        "/authorize?client_id=app-test&redirect_uri=http://localhost:5174/callback&state=mystate",
        follow_redirects=False
    )
    assert res_sess.status_code == 302
    target_url = res_sess.headers["location"]
    assert "http://localhost:5174/callback" in target_url

    parsed = urlparse(target_url)
    qs = parse_qs(parsed.query)
    assert "code" in qs
    assert qs["state"][0] == "mystate"
    code = qs["code"][0]

    # 5. Exchange code at /token
    res_token = client.post("/token", json={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": "app-test",
        "client_secret": "test-secret"
    })
    assert res_token.status_code == 200
    token_data = res_token.json()
    assert "access_token" in token_data
    assert "refresh_token" in token_data
    assert token_data["expires_in"] == 600

    access_token = token_data["access_token"]
    refresh_token = token_data["refresh_token"]

    # 6. Call /userinfo with access token
    res_userinfo = client.get("/userinfo", headers={"Authorization": f"Bearer {access_token}"})
    assert res_userinfo.status_code == 200
    uinfo = res_userinfo.json()
    assert uinfo["email"] == "sso_tester@example.com"
    assert uinfo["name"] == "SSO Tester"

    # 7. Code is single-use: attempting reuse fails
    res_reuse = client.post("/token", json={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": "app-test",
        "client_secret": "test-secret"
    })
    assert res_reuse.status_code == 400
    assert res_reuse.json()["error"] == "invalid_grant"

    # 8. Refresh access token
    res_refresh = client.post("/token/refresh", json={
        "refresh_token": refresh_token,
        "client_id": "app-test",
        "client_secret": "test-secret"
    })
    assert res_refresh.status_code == 200
    assert "access_token" in res_refresh.json()

    # 9. Mark user disabled -> refresh fails immediately with 403
    user.status = "disabled"
    db_session.commit()

    res_refresh_disabled = client.post("/token/refresh", json={
        "refresh_token": refresh_token,
        "client_id": "app-test",
        "client_secret": "test-secret"
    })
    assert res_refresh_disabled.status_code == 403
    assert res_refresh_disabled.json()["error"] == "account_disabled"

def test_authorize_wrong_redirect_uri_rejected(client, db_session):
    product = Product(
        name="App Test 2",
        client_id="app-test-2",
        client_secret_hash=hash_token("test-secret-2"),
        redirect_uri="http://localhost:5174/callback"
    )
    db_session.add(product)
    db_session.commit()

    res = client.get("/authorize?client_id=app-test-2&redirect_uri=http://attacker.com/evil")
    assert res.status_code == 400
    assert res.json()["error"] == "invalid_redirect_uri"
