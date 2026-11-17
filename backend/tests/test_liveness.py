from datetime import datetime, timedelta
from app.models import User, LivenessChallenge
from app.security import hash_password, hash_token

def test_liveness_flow(client, db_session):
    user = User(
        email="liveness_test@example.com",
        name="Liveness Tester",
        password_hash=hash_password("Pass12345"),
        role="member",
        status="active"
    )
    db_session.add(user)
    db_session.commit()

    # 1. Request challenge
    res = client.post("/liveness/challenge", json={"user_id": user.id})
    assert res.status_code == 200
    data = res.json()
    assert "challenge_id" in data
    assert "code" in data
    assert data["type"] in ["blink", "turn_left", "turn_right"]
    assert data["expires_in"] == 30

    challenge_id = data["challenge_id"]
    code = data["code"]

    # 2. Submit wrong code -> fails
    res_fail = client.post("/liveness/result", json={
        "challenge_id": challenge_id,
        "code": "WRONGCODE",
        "passed": True
    })
    assert res_fail.status_code == 400
    assert res_fail.json()["error"] == "invalid_code"

    # Request new challenge for valid pass
    res2 = client.post("/liveness/challenge", json={"user_id": user.id})
    data2 = res2.json()

    # 3. Submit correct code with passed=True -> sets cookie and returns ok
    res_pass = client.post("/liveness/result", json={
        "challenge_id": data2["challenge_id"],
        "code": data2["code"],
        "passed": True
    })
    assert res_pass.status_code == 200
    pass_data = res_pass.json()
    assert pass_data["status"] == "ok"
    assert pass_data["passed"] is True
    assert "session_id" in pass_data
    assert "sso_session" in res_pass.cookies

    # 4. Attempting to reuse the code fails
    res_reuse = client.post("/liveness/result", json={
        "challenge_id": data2["challenge_id"],
        "code": data2["code"],
        "passed": True
    })
    assert res_reuse.status_code == 400
    assert res_reuse.json()["error"] == "challenge_used"

def test_liveness_rate_limit(client, db_session):
    user = User(
        email="ratelimit_user@example.com",
        name="Rate Limit User",
        password_hash=hash_password("Pass12345"),
        role="member",
        status="active"
    )
    db_session.add(user)
    db_session.commit()

    # Max 5 challenges allowed
    for i in range(5):
        res = client.post("/liveness/challenge", json={"user_id": user.id})
        assert res.status_code == 200

    # 6th challenge should be rate limited (429)
    res6 = client.post("/liveness/challenge", json={"user_id": user.id})
    assert res6.status_code == 429
    assert res6.json()["error"] == "rate_limited"
