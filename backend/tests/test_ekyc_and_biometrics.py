from datetime import datetime, timedelta
import numpy as np
from app.models import User, Invite, SsoSession, LivenessChallenge, AuditLog
from app.security import create_signed_ticket, hash_password, hash_token, generate_random_token
from app.services.face_engine import (
    compare_face_embeddings,
    extract_face_embedding,
    SIMILARITY_THRESHOLD
)

def test_cosine_similarity_mathematics():
    """Verify Cosine Similarity computation, threshold behavior, and unit normalization."""
    # 1. Identical vectors must have similarity 1.0
    vec1 = [0.1] * 128
    is_match, score = compare_face_embeddings(vec1, vec1)
    assert is_match is True
    assert score == 1.0

    # 2. Orthogonal / independent random vectors in 128D space must have score near 0 (< 0.40)
    np.random.seed(1337)
    v_a = np.random.randn(128).tolist()
    v_b = np.random.randn(128).tolist()
    is_match_diff, score_diff = compare_face_embeddings(v_a, v_b)
    assert is_match_diff is False
    assert score_diff < SIMILARITY_THRESHOLD

    # 3. Vectors right at threshold
    v_base = np.zeros(128)
    v_base[0] = 1.0

    v_pass = np.zeros(128)
    v_pass[0] = 0.45
    v_pass[1] = np.sqrt(1.0 - 0.45**2)
    match_pass, score_pass = compare_face_embeddings(v_base.tolist(), v_pass.tolist())
    assert match_pass is True
    assert score_pass >= 0.40

    v_fail = np.zeros(128)
    v_fail[0] = 0.35
    v_fail[1] = np.sqrt(1.0 - 0.35**2)
    match_fail, score_fail = compare_face_embeddings(v_base.tolist(), v_fail.tolist())
    assert match_fail is False
    assert score_fail < 0.40


def test_ekyc_apply_and_admin_approval_lifecycle(client, db_session, monkeypatch):
    """
    Test full e-KYC Onboarding:
    1. Member submits application with face vector and document path.
    2. Account is set to pending_approval.
    3. Member cannot log in (HTTP 403 account_pending_approval).
    4. Admin inspects pending application via /admin/applications.
    5. Admin approves application -> status becomes active.
    6. Member can now log in.
    """
    import app.routes.auth as auth_module
    # Mock extract_face_embedding to simulate successful face feature detection from webcam
    monkeypatch.setattr(auth_module, "extract_face_embedding", lambda photo: [0.2] * 128)

    admin = User(
        email="dean_admin@example.com",
        name="Dean Admin",
        password_hash=hash_password("AdminPass123!"),
        role="admin",
        status="active"
    )
    db_session.add(admin)
    db_session.commit()

    admin_session = SsoSession(
        user_id=admin.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    db_session.add(admin_session)
    db_session.commit()

    client.cookies.set("sso_session", admin_session.id)

    # 1. Admin creates invite
    raw_invite_token = generate_random_token(32)
    invite = Invite(
        email="ekyc_student@example.com",
        role="member",
        token_hash=hash_token(raw_invite_token),
        expires_at=datetime.utcnow() + timedelta(days=7),
        created_by=admin.id
    )
    db_session.add(invite)
    db_session.commit()

    # 2. Student applies via /auth/apply
    # Mock base64 face snapshot data URL
    fake_face = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/" + "A" * 80
    res_apply = client.post("/auth/apply", json={
        "invite_token": raw_invite_token,
        "name": "EKYC Student",
        "password": "StudentPassword123!",
        "face_photo": fake_face
    })
    assert res_apply.status_code == 200
    apply_data = res_apply.json()
    assert apply_data["status"] == "ok"
    assert apply_data["next"] == "pending_approval"
    student_id = apply_data["user_id"]

    # 3. Student tries to log in while pending_approval -> HTTP 403
    res_login_pending = client.post("/auth/login", json={
        "email": "ekyc_student@example.com",
        "password": "StudentPassword123!"
    })
    assert res_login_pending.status_code == 403
    assert res_login_pending.json()["error"] == "account_pending_approval"

    # 4. Admin reviews pending applications
    res_apps = client.get("/admin/applications")
    assert res_apps.status_code == 200
    pending_list = res_apps.json()
    found = [app for app in pending_list if app["id"] == student_id]
    assert len(found) == 1
    assert found[0]["email"] == "ekyc_student@example.com"
    assert found[0]["name"] == "EKYC Student"

    # 5. Admin approves application
    res_approve = client.post(f"/admin/applications/{student_id}/approve")
    assert res_approve.status_code == 200
    assert res_approve.json()["status"] == "ok"

    student = db_session.query(User).filter(User.id == student_id).first()
    db_session.refresh(student)
    assert student.status == "active"
    assert student.approved_at is not None
    assert student.approved_by == admin.id

    # 6. Student can now log in
    res_login_active = client.post("/auth/login", json={
        "email": "ekyc_student@example.com",
        "password": "StudentPassword123!"
    })
    assert res_login_active.status_code == 200
    assert res_login_active.json()["next"] == "liveness"

    # Cleanup test artifact files
    from app.routes.auth import FACES_DIR
    test_photo = FACES_DIR / f"{student_id}.jpg"
    if test_photo.exists():
        test_photo.unlink()


def test_ekyc_admin_rejection(client, db_session):
    """Admin rejecting an application transitions account to disabled with application_rejected."""
    admin = User(
        email="reject_admin@example.com",
        name="Reject Admin",
        password_hash=hash_password("AdminPass123!"),
        role="admin",
        status="active"
    )
    applicant = User(
        email="rejected_applicant@example.com",
        name="Rejected Applicant",
        password_hash=hash_password("ApplicantPass123!"),
        role="member",
        status="pending_approval"
    )
    db_session.add_all([admin, applicant])
    db_session.commit()

    admin_session = SsoSession(
        user_id=admin.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    db_session.add(admin_session)
    db_session.commit()

    client.cookies.set("sso_session", admin_session.id)

    res_reject = client.post(f"/admin/applications/{applicant.id}/reject")
    assert res_reject.status_code == 200
    assert res_reject.json()["status"] == "ok"

    db_session.refresh(applicant)
    assert applicant.status == "disabled"
    assert applicant.disabled_reason == "application_rejected"


def test_liveness_with_biometric_face_matching(client, db_session, monkeypatch):
    """
    Test 1:1 facial biometric matching in liveness verification:
    - User with enrolled 128D embedding requires live_frame.
    - If face does not match stored profile, returns 401 face_mismatch.
    - If face matches stored profile (score >= 0.40), succeeds and issues session.
    """
    enrolled_embedding = [0.1] * 128
    user = User(
        email="biometric_user@example.com",
        name="Biometric User",
        password_hash=hash_password("SecurePass123!"),
        role="member",
        status="active",
        face_embedding=enrolled_embedding
    )
    db_session.add(user)
    db_session.commit()

    # 1. Request challenge
    ticket = create_signed_ticket(user.id, purpose="liveness")
    res_ch = client.post("/liveness/challenge", json={"user_id": user.id, "login_ticket": ticket})
    assert res_ch.status_code == 200
    ch_data = res_ch.json()
    challenge_id = ch_data["challenge_id"]
    code = ch_data["code"]

    # Case A: Passed physical liveness, but no live_frame provided -> rejected
    res_no_frame = client.post("/liveness/result", json={
        "challenge_id": challenge_id,
        "code": code,
        "passed": True,
        "login_ticket": ticket
    })
    assert res_no_frame.status_code == 400
    assert res_no_frame.json()["error"] == "live_frame_required"

    # Case B: Impostor face (mock verify_live_face_against_stored returning False)
    import app.routes.liveness as liveness_module
    monkeypatch.setattr(liveness_module, "is_face_engine_ready", lambda: True)
    monkeypatch.setattr(
        liveness_module,
        "verify_live_face_against_stored",
        lambda frame, emb: (False, 0.12, "Face does not match")
    )

    res_ch2 = client.post("/liveness/challenge", json={"user_id": user.id, "login_ticket": ticket})
    ch_data2 = res_ch2.json()

    res_impostor = client.post("/liveness/result", json={
        "challenge_id": ch_data2["challenge_id"],
        "code": ch_data2["code"],
        "passed": True,
        "live_frame": "data:image/jpeg;base64,impostor_frame",
        "login_ticket": ticket
    })
    assert res_impostor.status_code == 401
    res_impostor_data = res_impostor.json()
    assert res_impostor_data["status"] == "face_mismatch"
    assert res_impostor_data["error"] == "face_mismatch"

    # Case C: Genuine user face match (mock verify_live_face_against_stored returning True)
    monkeypatch.setattr(
        liveness_module,
        "verify_live_face_against_stored",
        lambda frame, emb: (True, 0.89, "Face match confirmed")
    )

    res_ch3 = client.post("/liveness/challenge", json={"user_id": user.id, "login_ticket": ticket})
    ch_data3 = res_ch3.json()

    res_genuine = client.post("/liveness/result", json={
        "challenge_id": ch_data3["challenge_id"],
        "code": ch_data3["code"],
        "passed": True,
        "live_frame": "data:image/jpeg;base64,genuine_frame",
        "login_ticket": ticket
    })
    assert res_genuine.status_code == 200
    res_genuine_data = res_genuine.json()
    assert res_genuine_data["status"] == "ok"
    assert res_genuine_data["passed"] is True
    assert "session_id" in res_genuine_data
    assert "sso_session" in res_genuine.cookies


def test_admin_face_lock_enforcement_gating(client, db_session, monkeypatch):
    """
    Test Admin Biometric Face Lock Gating:
    1. Admin cannot enforce biometric lock without any enrolled authorized face profiles (HTTP 400 no_face_enrolled).
    2. Admin enrolls authorized face profile -> 128D embedding saved in admin_faces.
    3. Admin can now toggle biometric lock freely.
    4. Deleting the last authorized face profile automatically disables biometric lock.
    """
    import app.routes.admin as admin_module

    # Mock extract_face_embedding to produce a valid 128-D vector
    monkeypatch.setattr(admin_module, "extract_face_embedding", lambda photo: [0.15] * 128)

    admin = User(
        email="gate_admin@example.com",
        name="Gate Admin",
        password_hash=hash_password("AdminGatePass123!"),
        role="admin",
        status="active",
        require_face_match=False,
        admin_faces=[]
    )
    db_session.add(admin)
    db_session.commit()

    admin_session = SsoSession(
        user_id=admin.id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=8)
    )
    db_session.add(admin_session)
    db_session.commit()

    client.cookies.set("sso_session", admin_session.id)

    # 1. Attempt to enforce biometric lock with 0 faces enrolled -> MUST FAIL
    res_toggle_fail = client.post("/admin/face-profiles/toggle-restriction", json={"enforce": True})
    assert res_toggle_fail.status_code == 400
    assert res_toggle_fail.json()["error"] == "no_face_enrolled"

    # 2. Check GET /admin/face-profiles
    res_profiles = client.get("/admin/face-profiles")
    assert res_profiles.status_code == 200
    assert res_profiles.json()["require_face_match"] is False
    assert len(res_profiles.json()["faces"]) == 0

    # 3. Enroll authorized face profile
    fake_face = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/" + "B" * 80
    res_enroll = client.post("/admin/face-profiles", json={
        "label": "Primary Admin Profile",
        "face_photo": fake_face
    })
    assert res_enroll.status_code == 200
    enroll_data = res_enroll.json()
    assert enroll_data["status"] == "ok"
    assert enroll_data["require_face_match"] is True
    face_id = enroll_data["face"]["id"]

    # 4. Verify in DB: admin_faces has 1 profile with 128D embedding
    db_session.refresh(admin)
    assert len(admin.admin_faces) == 1
    assert admin.admin_faces[0]["id"] == face_id
    assert admin.admin_faces[0]["label"] == "Primary Admin Profile"
    assert len(admin.admin_faces[0]["embedding"]) == 128
    assert admin.require_face_match is True

    # 5. Direct attempt to toggle off without 2FA must be rejected with 400 2fa_required
    res_toggle_off_blocked = client.post("/admin/face-profiles/toggle-restriction", json={"enforce": False})
    assert res_toggle_off_blocked.status_code == 400
    assert res_toggle_off_blocked.json()["error"] == "2fa_required"

    captured_otp = {}
    import app.routes.admin_facelock as facelock_mod
    monkeypatch.setattr(facelock_mod, "send_disable_face_lock_otp_email", lambda **kw: captured_otp.update(otp=kw["otp_code"]) or True)
    # Request 2FA OTP code
    res_otp_req = client.post("/admin/face-profiles/request-disable-otp")
    assert res_otp_req.status_code == 200
    otp_code = captured_otp.get("otp")
    assert otp_code is not None and len(otp_code) == 6

    # Wrong OTP fails
    res_verify_fail = client.post("/admin/face-profiles/verify-disable-otp", json={"otp": "000000"})
    assert res_verify_fail.status_code == 400
    assert res_verify_fail.json()["error"] == "invalid_otp"

    # Correct OTP succeeds and disables biometric lock
    res_verify_ok = client.post("/admin/face-profiles/verify-disable-otp", json={"otp": otp_code})
    assert res_verify_ok.status_code == 200
    assert res_verify_ok.json()["require_face_match"] is False

    # Admin can re-enforce biometric lock since face profile still exists
    res_toggle_on = client.post("/admin/face-profiles/toggle-restriction", json={"enforce": True})
    assert res_toggle_on.status_code == 200
    assert res_toggle_on.json()["require_face_match"] is True

    # 6. Delete face profile -> automatically disables biometric lock
    res_del = client.delete(f"/admin/face-profiles/{face_id}")
    assert res_del.status_code == 200
    assert res_del.json()["require_face_match"] is False

    db_session.refresh(admin)
    assert len(admin.admin_faces) == 0
    assert admin.require_face_match is False

    # 7. Attempting to re-enforce after deleting faces fails again
    res_re_enforce = client.post("/admin/face-profiles/toggle-restriction", json={"enforce": True})
    assert res_re_enforce.status_code == 400
    assert res_re_enforce.json()["error"] == "no_face_enrolled"

