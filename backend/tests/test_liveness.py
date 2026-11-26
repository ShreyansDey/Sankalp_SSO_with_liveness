from app.models import User, SsoSession, LivenessChallenge
from app.security import create_signed_ticket, hash_password


def test_liveness_requires_login_ticket(client, db_session):
    """Unauthenticated bare user_id requests must be rejected with 401 (prevents passwordless takeover)."""
    user = User(
        email="victim@example.com",
        name="Victim",
        password_hash=hash_password("Pass1234!"),
        role="member",
        status="active",
    )
    db_session.add(user)
    db_session.commit()

    res = client.post("/liveness/challenge", json={"user_id": user.id})
    assert res.status_code == 401
    assert res.json()["error"] == "login_ticket_required"


def test_liveness_flow(client, db_session):
    user = User(
        email="liveness_tester@example.com",
        name="Liveness Tester",
        password_hash=hash_password("Pass1234!"),
        role="member",
        status="active",
    )
    db_session.add(user)
    db_session.commit()

    ticket = create_signed_ticket(user.id, purpose="liveness")

    # 1. Request challenge with signed login_ticket
    res = client.post("/liveness/challenge", json={"user_id": user.id, "login_ticket": ticket})
    assert res.status_code == 200
    data = res.json()
    assert "challenge_id" in data
    assert data["type"] in ["blink", "turn_left", "turn_right"]
    assert "code" in data
    assert data["expires_in"] == 60

    challenge_id = data["challenge_id"]
    code = data["code"]

    # 2. Submit fail result -> HTTP 403 and no session
    res_fail = client.post(
        "/liveness/result",
        json={"challenge_id": challenge_id, "code": code, "passed": False, "login_ticket": ticket},
    )
    assert res_fail.status_code == 403
    assert res_fail.json()["status"] == "fail"
    assert db_session.query(SsoSession).filter(SsoSession.user_id == user.id).count() == 0

    # 3. Request new challenge and submit pass result
    res2 = client.post("/liveness/challenge", json={"user_id": user.id, "login_ticket": ticket})
    assert res2.status_code == 200
    data2 = res2.json()

    res_pass = client.post(
        "/liveness/result",
        json={"challenge_id": data2["challenge_id"], "code": data2["code"], "passed": True, "login_ticket": ticket},
    )
    assert res_pass.status_code == 200
    pass_data = res_pass.json()
    assert pass_data["status"] == "ok"
    assert pass_data["passed"] is True
    assert "session_id" in pass_data
    assert db_session.query(SsoSession).filter(SsoSession.user_id == user.id).count() == 1

    # 4. Try to reuse used challenge
    res_reuse = client.post(
        "/liveness/result",
        json={"challenge_id": data2["challenge_id"], "code": data2["code"], "passed": True, "login_ticket": ticket},
    )
    assert res_reuse.status_code == 400
    assert res_reuse.json()["error"] == "challenge_used"


def test_liveness_rate_limit(client, db_session):
    user = User(
        email="ratelimit@example.com",
        name="Rate Limit",
        password_hash=hash_password("Pass1234!"),
        role="member",
        status="active",
    )
    db_session.add(user)
    db_session.commit()

    ticket = create_signed_ticket(user.id, purpose="liveness")

    # Request 5 challenges
    for _ in range(5):
        res = client.post("/liveness/challenge", json={"user_id": user.id, "login_ticket": ticket})
        assert res.status_code == 200

    # 6th challenge should be rate limited (429)
    res6 = client.post("/liveness/challenge", json={"user_id": user.id, "login_ticket": ticket})
    assert res6.status_code == 429
    assert res6.json()["error"] == "rate_limited"
