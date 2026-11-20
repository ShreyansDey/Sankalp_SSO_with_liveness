from datetime import datetime, timedelta
from app.models import Invite, User, PasswordResetToken, SsoSession
from app.security import hash_password, hash_token, generate_random_token

def test_healthcheck(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

def test_signup_valid_invite(client, db_session):
    raw_token = "valid-test-token"
    invite = Invite(
        email="testuser@example.com",
        role="member",
        token_hash=hash_token(raw_token),
        expires_at=datetime.utcnow() + timedelta(days=1)
    )
    db_session.add(invite)
    db_session.commit()

    res = client.post("/auth/signup", json={
        "invite_token": raw_token,
        "name": "Test User",
        "password": "Password123!"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["next"] == "liveness"
    assert data["email"] == "testuser@example.com"

    # Verify invite is now used
    inv_check = db_session.query(Invite).filter(Invite.id == invite.id).first()
    assert inv_check.used_at is not None

def test_signup_used_invite_fails(client, db_session):
    raw_token = "used-test-token"
    invite = Invite(
        email="useduser@example.com",
        role="member",
        token_hash=hash_token(raw_token),
        expires_at=datetime.utcnow() + timedelta(days=1),
        used_at=datetime.utcnow()
    )
    db_session.add(invite)
    db_session.commit()

    res = client.post("/auth/signup", json={
        "invite_token": raw_token,
        "name": "Used User",
        "password": "Password123!"
    })
    assert res.status_code == 400
    assert res.json()["error"] == "invite_used"

def test_login_wrong_password_fails(client, db_session):
    user = User(
        email="alice@example.com",
        name="Alice",
        password_hash=hash_password("AliceSecret123"),
        role="member",
        status="active"
    )
    db_session.add(user)
    db_session.commit()

    res = client.post("/auth/login", json={
        "email": "alice@example.com",
        "password": "WrongPassword999"
    })
    assert res.status_code == 401
    assert res.json()["error"] == "invalid_credentials"

def test_login_disabled_user_fails(client, db_session):
    user = User(
        email="bob_disabled@example.com",
        name="Bob",
        password_hash=hash_password("BobSecret123"),
        role="member",
        status="disabled",
        disabled_reason="left"
    )
    db_session.add(user)
    db_session.commit()

    res = client.post("/auth/login", json={
        "email": "bob_disabled@example.com",
        "password": "BobSecret123"
    })
    assert res.status_code == 403
    assert res.json()["error"] == "account_disabled"

def test_login_valid_credentials_requires_liveness(client, db_session):
    user = User(
        email="charlie@example.com",
        name="Charlie",
        password_hash=hash_password("CharlieSecret123"),
        role="member",
        status="active"
    )
    db_session.add(user)
    db_session.commit()

    res = client.post("/auth/login", json={
        "email": "charlie@example.com",
        "password": "CharlieSecret123"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["next"] == "liveness"
    assert data["user_id"] == user.id

def test_forgot_password_generates_token(db_session):
    user = User(
        email="reset_target@example.com",
        name="Reset Target",
        password_hash=hash_password("InitialPass123!"),
        role="member",
        status="active"
    )
    db_session.add(user)
    db_session.commit()

    from app.routes.auth import forgot_password, ForgotPasswordRequest
    res = forgot_password(ForgotPasswordRequest(email="reset_target@example.com"), db=db_session)
    assert res["status"] == "ok"

    tok = db_session.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None)
    ).first()
    assert tok is not None
    assert tok.expires_at > datetime.utcnow()

def test_verify_and_reset_password_flow(db_session):
    user = User(
        email="reset_flow@example.com",
        name="Reset Flow",
        password_hash=hash_password("OldSecret123!"),
        role="member",
        status="active"
    )
    db_session.add(user)
    db_session.commit()

    # Active session that must be revoked upon password reset
    sess = SsoSession(
        user_id=user.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    db_session.add(sess)
    db_session.commit()

    raw_token = generate_random_token(32)
    tok_record = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    db_session.add(tok_record)
    db_session.commit()

    from app.routes.auth import verify_reset_token, reset_password, VerifyResetTokenRequest, ResetPasswordRequest

    # Verify token
    v_res = verify_reset_token(VerifyResetTokenRequest(token=raw_token), db=db_session)
    assert v_res["valid"] is True
    assert "r***@example.com" in v_res["masked_email"] or "reset_flow@example.com" in v_res["masked_email"]

    # Reset password
    new_pw = "BrandNewSecret123!"
    r_res = reset_password(ResetPasswordRequest(token=raw_token, password=new_pw), db=db_session)
    assert r_res["status"] == "ok"

    # Verify user password updated
    from app.security import verify_password
    db_session.refresh(user)
    assert verify_password(new_pw, user.password_hash) is True
    assert verify_password("OldSecret123!", user.password_hash) is False

    # Verify token marked used
    db_session.refresh(tok_record)
    assert tok_record.used_at is not None

    # Verify active session was revoked
    db_session.refresh(sess)
    assert sess.revoked_at is not None

def test_admin_must_use_password_and_liveness(db_session):
    """Admin must log in with proper password and proceed to liveness check; direct admin-login is removed."""
    from fastapi import Request, Response, HTTPException
    from app.routes.auth import login, admin_login, LoginRequest

    admin = User(
        email="admin_test@jadavpur.edu",
        name="Test Admin",
        password_hash=hash_password("AdminSecurePass123!"),
        role="admin",
        status="active"
    )
    db_session.add(admin)
    db_session.commit()

    # 1. Direct admin-login bypass is removed and raises 400
    try:
        admin_login()
        assert False, "admin_login should have raised 400 HTTPException"
    except HTTPException as e:
        assert e.status_code == 400
        assert e.detail["error"] == "admin_login_removed"

    # 2. Central login validates password and directs admin to liveness
    req = LoginRequest(email="admin_test@jadavpur.edu", password="AdminSecurePass123!")
    res = login(req, Request({"type": "http", "headers": []}), Response(), db_session)
    assert res["status"] == "ok"
    assert res["next"] == "liveness"
    assert res["user_id"] == admin.id

