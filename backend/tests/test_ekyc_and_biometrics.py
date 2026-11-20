from datetime import datetime, timedelta
import numpy as np
from app.models import User, Invite, SsoSession, LivenessChallenge, AuditLog
from app.security import hash_password, hash_token, generate_random_token
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
    fake_face = "data:image/jpeg;base64," + "a" * 100
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
    res_ch = client.post("/liveness/challenge", json={"user_id": user.id})
    assert res_ch.status_code == 200
    ch_data = res_ch.json()
    challenge_id = ch_data["challenge_id"]
    code = ch_data["code"]

    # Case A: Passed physical liveness, but no live_frame provided -> rejected
    res_no_frame = client.post("/liveness/result", json={
        "challenge_id": challenge_id,
        "code": code,
        "passed": True
    })
    assert res_no_frame.status_code == 200
    assert res_no_frame.json()["status"] == "fail"
    assert res_no_frame.json()["error"] == "face_mismatch"

    # Case B: Impostor face (mock verify_live_face_against_stored returning False)
    import app.routes.liveness as liveness_module
    monkeypatch.setattr(liveness_module, "is_face_engine_ready", lambda: True)
    monkeypatch.setattr(
        liveness_module,
        "verify_live_face_against_stored",
        lambda frame, emb: (False, 0.12, "Face does not match")
    )

    res_ch2 = client.post("/liveness/challenge", json={"user_id": user.id})
    ch_data2 = res_ch2.json()

    res_impostor = client.post("/liveness/result", json={
        "challenge_id": ch_data2["challenge_id"],
        "code": ch_data2["code"],
        "passed": True,
        "live_frame": "data:image/jpeg;base64,impostor_frame"
    })
    assert res_impostor.status_code == 200
    res_impostor_data = res_impostor.json()
    assert res_impostor_data["status"] == "fail"
    assert res_impostor_data["error"] == "face_mismatch"

    # Case C: Genuine user face match (mock verify_live_face_against_stored returning True)
    monkeypatch.setattr(
        liveness_module,
        "verify_live_face_against_stored",
        lambda frame, emb: (True, 0.89, "Face match confirmed")
    )

    res_ch3 = client.post("/liveness/challenge", json={"user_id": user.id})
    ch_data3 = res_ch3.json()

    res_genuine = client.post("/liveness/result", json={
        "challenge_id": ch_data3["challenge_id"],
        "code": ch_data3["code"],
        "passed": True,
        "live_frame": "data:image/jpeg;base64,genuine_frame"
    })
    assert res_genuine.status_code == 200
    res_genuine_data = res_genuine.json()
    assert res_genuine_data["status"] == "ok"
    assert res_genuine_data["passed"] is True
    assert "session_id" in res_genuine_data
    assert "sso_session" in res_genuine.cookies
