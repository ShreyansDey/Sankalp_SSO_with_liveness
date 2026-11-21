from datetime import datetime, date, timedelta
from app.models import User, SsoSession, RefreshToken, Product, Invite
from app.security import hash_password, hash_token
from app.jobs.cleanup import run_cleanup_job

def test_admin_and_cleanup_flow(client, db_session):
    # Setup admin
    admin = User(
        email="superadmin@example.com",
        name="Super Admin",
        password_hash=hash_password("AdminPass123"),
        role="admin",
        status="active"
    )
    # Setup test member Rahul
    rahul = User(
        email="rahul_test@example.com",
        name="Rahul Test",
        password_hash=hash_password("RahulPass123"),
        role="member",
        status="active"
    )
    # Setup test expired user
    expired_user = User(
        email="expired_test@example.com",
        name="Expired Test",
        password_hash=hash_password("ExpiredPass123"),
        role="member",
        status="active",
        term_end=date.today() - timedelta(days=10)
    )
    # Setup test product
    product = Product(
        name="Club App",
        client_id="club-app",
        client_secret_hash=hash_token("club-secret"),
        redirect_uri="http://localhost:5174/callback"
    )
    db_session.add_all([admin, rahul, expired_user, product])
    db_session.commit()

    # Admin SSO session
    admin_session = SsoSession(
        user_id=admin.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    # Rahul active session and refresh token
    rahul_session = SsoSession(
        user_id=rahul.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    rahul_refresh = RefreshToken(
        user_id=rahul.id,
        product_id=product.id,
        token_hash=hash_token("rahul-refresh-tok"),
        expires_at=datetime.utcnow() + timedelta(days=30)
    )
    db_session.add_all([admin_session, rahul_session, rahul_refresh])
    db_session.commit()

    client.cookies.set("sso_session", admin_session.id)

    # 1. Admin creates invite
    res_inv = client.post("/admin/invites", json={
        "email": "invited_fresh@example.com",
        "role": "member",
        "term_end": str(date.today() + timedelta(days=90))
    })
    assert res_inv.status_code == 200
    assert "invite_token" in res_inv.json()
    assert "link" in res_inv.json()

    # 2. Admin marks Rahul as left
    res_left = client.post(f"/admin/users/{rahul.id}/mark-left")
    assert res_left.status_code == 200

    # 2b. Admin CANNOT mark another admin (or themselves) as left or disabled
    res_admin_left = client.post(f"/admin/users/{admin.id}/mark-left")
    assert res_admin_left.status_code == 400
    assert res_admin_left.json()["error"] == "cannot_remove_admin"

    res_admin_disable = client.post(f"/admin/users/{admin.id}/disable", json={"reason": "test"})
    assert res_admin_disable.status_code == 400
    assert res_admin_disable.json()["error"] == "cannot_remove_admin"

    # Verify Rahul is disabled and reason is 'left'
    db_session.refresh(rahul)
    assert rahul.status == "disabled"
    assert rahul.disabled_reason == "left"
    assert rahul.disabled_at is not None

    # Verify Rahul's session and refresh token were revoked
    db_session.refresh(rahul_session)
    db_session.refresh(rahul_refresh)
    assert rahul_session.revoked_at is not None
    assert rahul_refresh.revoked_at is not None

    # 3. Test delete request & approval rules
    # Delete request on disabled user
    res_del_req = client.post(f"/admin/users/{rahul.id}/delete-request")
    assert res_del_req.status_code == 200

    # Delete approve before 30 days -> must fail!
    res_del_app_early = client.post(f"/admin/users/{rahul.id}/delete-approve")
    assert res_del_app_early.status_code == 400
    assert res_del_app_early.json()["error"] == "waiting_period_active"

    # Simulate 31 days passed
    rahul.disabled_at = datetime.utcnow() - timedelta(days=31)
    db_session.commit()

    res_del_app_ok = client.post(f"/admin/users/{rahul.id}/delete-approve")
    assert res_del_app_ok.status_code == 200
    db_session.refresh(rahul)
    assert rahul.status == "deleted"

    # 4. Run cleanup job -> disables expired_user
    res_cleanup = client.post("/admin/cleanup/run")
    assert res_cleanup.status_code == 200
    cleanup_data = res_cleanup.json()
    assert cleanup_data["total_disabled"] >= 1

    db_session.refresh(expired_user)
    assert expired_user.status == "disabled"
    assert expired_user.disabled_reason == "term_end"

    # 5. Check audit log
    res_audit = client.get("/admin/audit?limit=50")
    assert res_audit.status_code == 200
    audit_entries = res_audit.json()
    actions = [e["action"] for e in audit_entries]
    assert "user_marked_left" in actions
    assert "user_disabled_auto" in actions
    assert "delete_requested" in actions
    assert "delete_approved" in actions
