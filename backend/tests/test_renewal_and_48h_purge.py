from datetime import datetime, timedelta, date
from app.models import User, SsoSession, RefreshToken, RenewalRequest, AuditLog
from app.security import hash_password, hash_token, generate_random_token
from app.jobs.cleanup import run_cleanup_job

def test_mark_as_left_initializes_48h_recovery_window(client, db_session):
    admin = User(
        email="super_admin@example.com",
        name="Super Admin",
        password_hash=hash_password("AdminPass123!"),
        role="admin",
        status="active"
    )
    student = User(
        email="accidental_left@example.com",
        name="Accidental Left Student",
        password_hash=hash_password("StudentPass123!"),
        role="member",
        status="active"
    )
    db_session.add_all([admin, student])
    db_session.commit()

    admin_session = SsoSession(
        user_id=admin.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    student_session = SsoSession(
        user_id=student.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    db_session.add_all([admin_session, student_session])
    db_session.commit()

    client.cookies.set("sso_session", admin_session.id)

    # 1. Admin marks user as left
    res = client.post(f"/admin/users/{student.id}/mark-left")
    assert res.status_code == 200
    assert "48-hour purge window initialized" in res.json()["message"]

    db_session.refresh(student)
    assert student.status == "disabled"
    assert student.disabled_reason == "left"
    assert student.disabled_at is not None

    # Verify session was revoked
    db_session.refresh(student_session)
    assert student_session.revoked_at is not None


def test_user_submit_and_admin_approve_renewal(client, db_session):
    admin = User(
        email="renewal_admin@example.com",
        name="Renewal Admin",
        password_hash=hash_password("AdminPass123!"),
        role="admin",
        status="active"
    )
    student = User(
        email="rahul_renew@example.com",
        name="Rahul Sharma",
        password_hash=hash_password("RahulPass123!"),
        role="member",
        status="disabled",
        disabled_reason="left",
        disabled_at=datetime.utcnow() - timedelta(hours=2)  # 2 hours into 48h window
    )
    db_session.add_all([admin, student])
    db_session.commit()

    admin_session = SsoSession(
        user_id=admin.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    db_session.add(admin_session)
    db_session.commit()

    # 1. Student submits renewal request via /auth/renew
    res_renew = client.post("/auth/renew", json={
        "email": "rahul_renew@example.com",
        "reason": "Admin marked me as left accidentally during club roll-call."
    })
    assert res_renew.status_code == 200
    renew_data = res_renew.json()
    assert renew_data["status"] == "ok"
    request_id = renew_data["request_id"]

    # Verify RenewalRequest record in DB
    req_obj = db_session.query(RenewalRequest).filter(RenewalRequest.id == request_id).first()
    assert req_obj is not None
    assert req_obj.status == "pending"
    assert "accidentally" in req_obj.reason

    # 2. Admin reviews renewals desk
    client.cookies.set("sso_session", admin_session.id)
    res_list = client.get("/admin/renewals")
    assert res_list.status_code == 200
    renewals_list = res_list.json()
    found = [r for r in renewals_list if r["id"] == request_id]
    assert len(found) == 1
    assert found[0]["email"] == "rahul_renew@example.com"
    assert found[0]["hours_left"] > 45.0  # Approx 46 hours left

    # 3. Admin approves renewal request
    res_approve = client.post(f"/admin/renewals/{request_id}/approve", json={
        "notes": "Verified with faculty advisor. Restored."
    })
    assert res_approve.status_code == 200
    assert res_approve.json()["status"] == "ok"

    # Verify student is reactivated
    db_session.refresh(student)
    assert student.status == "active"
    assert student.disabled_at is None
    assert student.disabled_reason is None

    # Verify renewal request marked approved
    db_session.refresh(req_obj)
    assert req_obj.status == "approved"
    assert req_obj.resolved_by == admin.id


def test_admin_decline_renewal(client, db_session):
    admin = User(
        email="decline_admin@example.com",
        name="Decline Admin",
        password_hash=hash_password("AdminPass123!"),
        role="admin",
        status="active"
    )
    student = User(
        email="leaving_student@example.com",
        name="Leaving Student",
        password_hash=hash_password("StudentPass123!"),
        role="member",
        status="disabled",
        disabled_reason="left",
        disabled_at=datetime.utcnow() - timedelta(hours=5)
    )
    db_session.add_all([admin, student])
    db_session.commit()

    admin_session = SsoSession(
        user_id=admin.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    db_session.add(admin_session)
    db_session.commit()

    # Create pending renewal request
    req = RenewalRequest(
        user_id=student.id,
        email=student.email,
        name=student.name,
        reason="Please let me back in",
        status="pending"
    )
    db_session.add(req)
    db_session.commit()

    client.cookies.set("sso_session", admin_session.id)
    res_decline = client.post(f"/admin/renewals/{req.id}/decline", json={
        "notes": "Student has completed graduation; not eligible for active roster."
    })
    assert res_decline.status_code == 200

    db_session.refresh(req)
    assert req.status == "declined"

    db_session.refresh(student)
    assert student.status == "disabled"


def test_48_hour_hard_purge_execution(db_session, monkeypatch):
    """
    Test that users disabled for > 48 hours without approved renewal are permanently purged.
    Users disabled < 48 hours are preserved.
    Verifies that a full personal data takeout export email is dispatched immediately prior to hard purge.
    """
    now = datetime.utcnow()

    # Track takeout emails dispatched
    takeout_calls = []

    def mock_takeout_email(to_email, user_data, background=False):
        takeout_calls.append({"email": to_email, "data": user_data})
        return True

    monkeypatch.setattr("app.jobs.cleanup.send_final_purge_takeout_email", mock_takeout_email)

    # User A: Disabled 50 hours ago (Past 48h window -> MUST BE PURGED)
    old_user = User(
        email="purged_student@example.com",
        name="Old Purged Student",
        phone="+91 98765 43210",
        password_hash=hash_password("PurgePass123!"),
        role="member",
        status="disabled",
        disabled_reason="left",
        disabled_at=now - timedelta(hours=50)
    )

    # User B: Disabled 10 hours ago (Within 48h window -> MUST BE PRESERVED)
    recent_user = User(
        email="safe_student@example.com",
        name="Recent Safe Student",
        phone="+91 91234 56789",
        password_hash=hash_password("SafePass123!"),
        role="member",
        status="disabled",
        disabled_reason="left",
        disabled_at=now - timedelta(hours=10)
    )

    db_session.add_all([old_user, recent_user])
    db_session.commit()

    old_user_id = old_user.id
    recent_user_id = recent_user.id

    # Run cleanup janitor job
    cleanup_res = run_cleanup_job(db_session)
    assert cleanup_res["status"] == "ok"
    assert cleanup_res["total_purged"] >= 1

    purged_ids = [p["id"] for p in cleanup_res["purged_users"]]
    assert old_user_id in purged_ids

    # Verify old_user is completely deleted from the database (no frozen vault records)
    check_old = db_session.query(User).filter(User.id == old_user_id).first()
    assert check_old is None

    # Verify recent_user is still in the database (safely held within 48h window)
    check_recent = db_session.query(User).filter(User.id == recent_user_id).first()
    assert check_recent is not None
    assert check_recent.status == "disabled"

    # Verify personal data takeout email was dispatched for old_user
    assert len(takeout_calls) >= 1
    purged_takeout = [t for t in takeout_calls if t["email"] == "purged_student@example.com"]
    assert len(purged_takeout) == 1
    takeout_data = purged_takeout[0]["data"]
    assert takeout_data["name"] == "Old Purged Student"
    assert takeout_data["email"] == "purged_student@example.com"
    assert takeout_data["phone"] == "+91 98765 43210"
    assert takeout_data["disabled_reason"] == "left"

    # Verify no takeout email was dispatched for safe_student
    safe_takeout = [t for t in takeout_calls if t["email"] == "safe_student@example.com"]
    assert len(safe_takeout) == 0

    # Verify audit log contains user_purged_permanently
    audit_entry = db_session.query(AuditLog).filter(
        AuditLog.action == "user_purged_permanently",
        AuditLog.target_id == old_user_id
    ).first()
    assert audit_entry is not None
    assert audit_entry.detail["email"] == "purged_student@example.com"
    assert audit_entry.detail["held_hours"] == 48


def test_window_expired_blocks_late_renewal(client, db_session):
    """Submitting renewal after 48-hour window returns 400 window_expired."""
    late_user = User(
        email="too_late@example.com",
        name="Too Late Student",
        password_hash=hash_password("LatePass123!"),
        role="member",
        status="disabled",
        disabled_reason="term_end",
        disabled_at=datetime.utcnow() - timedelta(hours=52)  # 52 hours ago (> 48h)
    )
    db_session.add(late_user)
    db_session.commit()

    res = client.post("/auth/renew", json={
        "email": "too_late@example.com",
        "reason": "Forgot to apply earlier."
    })
    assert res.status_code == 400
    assert res.json()["error"] == "window_expired"
