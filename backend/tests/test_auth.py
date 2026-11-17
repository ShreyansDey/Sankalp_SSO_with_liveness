from datetime import datetime, timedelta
from app.models import Invite, User
from app.security import hash_password, hash_token

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
