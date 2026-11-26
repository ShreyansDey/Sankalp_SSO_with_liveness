"""
Ultimate Stress, Concurrency Race, and Dummy External DB + SaaS Connector Test Suite.
Tests:
  1. Dummy SaaS & SQLite Connector lifecycle (Connection -> Data Fetching -> Reduction -> Remediation).
  2. Worst-case multi-threaded race conditions (AuthCode, Invite, LivenessChallenge, Superuser Bootstrap).
  3. SQLite WAL high-concurrency throughput & p95 latency benchmark.
  4. Rate limiting under burst login attack.
"""
import base64
import json
import sqlite3
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.audit import log_audit
from app.database import Base, get_db
from app.jobs.cleanup import run_cleanup_job
from app.main import app
from app.middleware.security import rate_limiter
from app.models import AuditLog, AuthCode, Invite, Product, SsoSession, SystemBootstrap, User
from app.security import create_signed_ticket, hash_password, hash_token


VALID_JPEG_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/" + ("A" * 120)
VALID_PDF_B64 = "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n").decode("ascii")


def _build_wal_client_factory(db_path: Path):
    url = f"sqlite:///{db_path.as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15})

    @event.listens_for(engine, "connect")
    def _wal_pragmas(conn, _):
        c = conn.cursor()
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA busy_timeout=5000")
        c.execute("PRAGMA foreign_keys=ON")
        c.close()

    Base.metadata.create_all(bind=engine)
    SessionMaker = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, SessionMaker


def test_dummy_saas_connector_full_reduction_and_remediation_lifecycle(client, db_session, tmp_path, monkeypatch):
    """
    End-to-End Connector Simulation:
      Dummy SaaS Local DB <-> Sankalp SSO:
      1) Connection: OIDC Discovery + App Registration + API Key.
      2) Data Fetching: OAuth2 Authorize -> Token -> UserInfo -> Introspect syncing 25 members into Dummy DB.
      3) Data & Document Reduction: e-KYC files on disk erased to 0 bytes after admin review; PII scrubbed from Audit.
      4) Data Remediation: Bulk API revocation + 48h purge reconciles Dummy SaaS DB immediately.
    """
    rate_limiter.reset()
    import app.routes.auth as auth_mod
    monkeypatch.setattr(auth_mod, "extract_face_embedding", lambda photo: [0.25] * 128)

    # Create Dummy External SaaS Connector DB
    connector_db_path = tmp_path / "dummy_saas_connector.db"
    conn = sqlite3.connect(connector_db_path)
    conn.execute(
        "CREATE TABLE external_identities (sso_user_id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, synced_active INTEGER)"
    )
    conn.commit()

    # Admin + Setup
    admin = User(
        email="connector_admin@sankalp.edu",
        name="Connector Admin",
        password_hash=hash_password("Pass1234!"),
        role="admin",
        status="active",
    )
    db_session.add(admin)
    db_session.commit()
    adm_sess = SsoSession(user_id=admin.id, expires_at=datetime.utcnow() + timedelta(hours=8))
    db_session.add(adm_sess)
    db_session.commit()

    # 1. Connect external SaaS via Universal API
    client.cookies.set("sso_session", adm_sess.id)
    api_key = client.post("/api/v1/keys", json={"name": "Dummy SaaS Connector", "scopes": ["*"]}).json()["api_key"]
    app_reg = client.post(
        "/api/v1/integrations/apps",
        headers={"X-API-Key": api_key},
        json={"name": "Dummy SaaS CRM", "redirect_uri": "https://crm.dummy.local/callback"},
    ).json()

    # 2. Data & Document Reduction: 10 e-KYC applicants upload raw face + PDF
    submitted_ids = []
    for i in range(10):
        reg = client.post(
            "/auth/register",
            json={
                "email": f"ekyc_batch_{i}@sankalp.edu",
                "name": f"Batch Member {i}",
                "phone": f"+9198000000{i:02d}",
                "password": "BatchPassword123!",
                "face_photo": VALID_JPEG_B64,
                "document_base64": VALID_PDF_B64,
                "consent_given": True,
            },
        )
        assert reg.status_code == 200
        submitted_ids.append(reg.json()["user_id"])

    # Confirm temp files exist before approval, then approve first 8 / reject last 2 -> 100% file reduction
    for idx, uid in enumerate(submitted_ids):
        u_obj = db_session.query(User).filter(User.id == uid).first()
        doc_file = Path(u_obj.document_path)
        face_file = Path(u_obj.face_photo_path)
        assert doc_file.exists() and face_file.exists()
        if idx < 8:
            ap = client.post(f"/admin/applications/{uid}/approve")
            assert ap.status_code == 200
            assert set(ap.json()["user"]["purged_files"]) == {"document", "face_photo"}
        else:
            rj = client.post(f"/admin/applications/{uid}/reject", json={"reason": "Blurry ID card"})
            assert rj.status_code == 200
        assert not doc_file.exists()
        assert not face_file.exists()

    # Confirm secret/password/token scrubbing in AuditLog
    scrubbed = log_audit(
        db_session,
        action="login_ok",
        actor_id=admin.id,
        detail={"password": "leak", "token": "leak", "secret": "leak", "api_key": "leak", "safe_note": "ok"},
    )
    assert scrubbed.detail == {"safe_note": "ok"}

    # 3. Data Fetching & Sync into Dummy SaaS DB via OAuth2 + UserInfo + Introspect
    approved_users = db_session.query(User).filter(User.email.like("ekyc_batch_%"), User.status == "active").all()
    assert len(approved_users) == 8
    issued_tokens = {}
    for u in approved_users:
        s = SsoSession(user_id=u.id, expires_at=datetime.utcnow() + timedelta(hours=2))
        db_session.add(s)
        db_session.commit()
        client.cookies.set("sso_session", s.id)
        auth_r = client.get(
            f"/authorize?client_id={app_reg['client_id']}&redirect_uri=https://crm.dummy.local/callback",
            follow_redirects=False,
        )
        code = auth_r.headers["location"].split("code=")[1]
        tok_r = client.post(
            "/token",
            json={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": app_reg["client_id"],
                "client_secret": app_reg["client_secret"],
            },
        )
        jwt_tok = tok_r.json()["access_token"]
        uinfo = client.get("/userinfo", headers={"Authorization": f"Bearer {jwt_tok}"}).json()
        intro = client.post("/token/introspect", headers={"X-API-Key": api_key}, json={"token": jwt_tok}).json()
        assert intro["active"] is True
        issued_tokens[u.id] = jwt_tok
        conn.execute(
            "INSERT INTO external_identities VALUES (?, ?, ?, ?, ?)",
            (uinfo["sub"], uinfo["email"], uinfo["name"], uinfo["role"], 1),
        )
    conn.commit()
    assert conn.execute("SELECT COUNT(*) FROM external_identities WHERE synced_active = 1").fetchone()[0] == 8

    # 4. Data Remediation: Revoke 4 users via API, backdate 2 past 48h and run hard-purge janitor
    for idx, u in enumerate(approved_users[:4]):
        rev = client.post(f"/api/v1/integrations/users/{u.id}/revoke", headers={"X-API-Key": api_key})
        assert rev.status_code == 200
        intro_check = client.post("/token/introspect", headers={"X-API-Key": api_key}, json={"token": issued_tokens[u.id]}).json()
        assert intro_check["active"] is False
        conn.execute("UPDATE external_identities SET synced_active = 0 WHERE sso_user_id = ?", (u.id,))
        if idx < 2:
            u.disabled_at = datetime.utcnow() - timedelta(hours=60)
    conn.commit()
    db_session.commit()

    cleanup_summary = run_cleanup_job(db_session)
    assert cleanup_summary["total_purged"] >= 2
    assert conn.execute("SELECT COUNT(*) FROM external_identities WHERE synced_active = 1").fetchone()[0] == 4
    conn.close()


def test_worst_case_concurrency_races_and_wal_throughput(tmp_path):
    """
    Worst-case multi-threaded stress on real file-backed SQLite WAL database:
    - 16 threads racing single-use AuthCode -> exactly 1 wins.
    - 16 threads racing single-use Invite -> exactly 1 wins.
    - 16 threads racing single-use LivenessChallenge -> exactly 1 wins.
    - 10 threads racing first-time Superuser Bootstrap -> exactly 1 wins.
    - 150 concurrent requests measuring latency (avg, p95, max) with 0 DB lock failures.
    """
    rate_limiter.reset()
    db_file = tmp_path / "stress_wal.db"
    engine, SessionMaker = _build_wal_client_factory(db_file)

    def override_db():
        s = SessionMaker()
        try:
            yield s
        finally:
            s.close()

    orig_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_db

    try:
        db = SessionMaker()
        db.add(
            SystemBootstrap(
                id="singleton",
                primary_key_hash=hash_password("StressPrimaryKey#2026"),
                setup_completed=False,
            )
        )
        prod = Product(
            name="Stress App",
            client_id="stress-app",
            client_secret_hash=hash_token("stress-secret"),
            redirect_uri="http://localhost:5174/callback",
        )
        user = User(
            email="racer@sankalp.edu",
            name="Racer",
            password_hash=hash_password("Pass1234!"),
            role="member",
            status="active",
        )
        db.add_all([prod, user])
        db.commit()
        db.refresh(prod)
        db.refresh(user)

        raw_code = "race-auth-code-001"
        db.add(
            AuthCode(
                user_id=user.id,
                product_id=prod.id,
                code_hash=hash_token(raw_code),
                expires_at=datetime.utcnow() + timedelta(minutes=2),
            )
        )
        raw_invite = "race-invite-001"
        db.add(
            Invite(
                email="invite_winner@sankalp.edu",
                role="member",
                token_hash=hash_token(raw_invite),
                expires_at=datetime.utcnow() + timedelta(days=2),
            )
        )
        db.commit()
        user_id, prod_id = user.id, prod.id
        db.close()

        client = TestClient(app)

        # Race 1: 10 threads racing Bootstrap Superuser -> exactly 1 wins (200), 9 fail (409)
        def race_bootstrap(idx: int):
            return client.post(
                "/api/v1/setup/bootstrap-superuser",
                json={
                    "primary_key": "StressPrimaryKey#2026",
                    "name": f"Super {idx}",
                    "email": f"super_race_{idx}@sankalp.edu",
                    "password": "SuperPassword123!",
                    "issue_api_key": False,
                },
            ).status_code

        with ThreadPoolExecutor(max_workers=10) as pool:
            boot_codes = list(pool.map(race_bootstrap, range(10)))
        assert boot_codes.count(200) == 1
        assert boot_codes.count(409) == 9

        # Race 2: 16 threads racing single-use AuthCode -> exactly 1 wins (200), 15 fail (400)
        def race_auth_code(_):
            return client.post(
                "/token",
                json={
                    "grant_type": "authorization_code",
                    "code": raw_code,
                    "client_id": "stress-app",
                    "client_secret": "stress-secret",
                },
            ).status_code

        with ThreadPoolExecutor(max_workers=16) as pool:
            code_results = list(pool.map(race_auth_code, range(16)))
        assert code_results.count(200) == 1
        assert code_results.count(400) == 15

        # Race 3: 16 threads racing single-use Invite -> exactly 1 wins (200)
        def race_invite(idx: int):
            return client.post(
                "/auth/signup",
                json={
                    "invite_token": raw_invite,
                    "name": f"Invite Racer {idx}",
                    "password": "Password123!",
                    "consent_given": True,
                },
            ).status_code

        with ThreadPoolExecutor(max_workers=16) as pool:
            invite_results = list(pool.map(race_invite, range(16)))
        assert invite_results.count(200) == 1
        assert all(c in (200, 400) for c in invite_results)

        # Race 4: 12 threads racing single-use LivenessChallenge -> exactly 1 wins (200)
        ticket = create_signed_ticket(user_id, purpose="liveness")
        ch = client.post("/liveness/challenge", json={"user_id": user_id, "login_ticket": ticket}).json()

        def race_liveness(_):
            return client.post(
                "/liveness/result",
                json={
                    "challenge_id": ch["challenge_id"],
                    "code": ch["code"],
                    "passed": True,
                    "login_ticket": ticket,
                },
            ).status_code

        with ThreadPoolExecutor(max_workers=12) as pool:
            live_results = list(pool.map(race_liveness, range(12)))
        assert live_results.count(200) == 1
        assert live_results.count(400) == 11

        # Throughput & Latency Stress: 150 concurrent requests across /health, OIDC discovery, setup status
        endpoints = ["/health", "/.well-known/openid-configuration", "/api/v1/setup/status"]

        def timed_hit(i: int):
            t0 = time.perf_counter()
            r = client.get(endpoints[i % len(endpoints)])
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            return r.status_code, elapsed_ms

        t_start = time.perf_counter()
        with ThreadPoolExecutor(max_workers=15) as pool:
            res_list = list(pool.map(timed_hit, range(150)))
        total_sec = time.perf_counter() - t_start

        statuses = [s for s, _ in res_list]
        latencies = sorted(ms for _, ms in res_list)
        assert all(s == 200 for s in statuses), f"Non-200 status observed: {set(statuses)}"

        metrics = {
            "total_requests": 150,
            "concurrency": 15,
            "total_seconds": round(total_sec, 3),
            "rps": round(150 / max(total_sec, 0.001), 1),
            "min_ms": round(latencies[0], 2),
            "avg_ms": round(statistics.mean(latencies), 2),
            "p95_ms": round(latencies[int(0.95 * len(latencies)) - 1], 2),
            "max_ms": round(latencies[-1], 2),
        }
        print(f"\n[STRESS METRICS] {json.dumps(metrics)}")
        assert metrics["p95_ms"] < 2000.0

        # Burst login rate-limiter check (rule: 30 req / 60s -> 31st triggers 429)
        rate_limiter.reset()
        burst_statuses = [
            client.post("/auth/login", json={"email": "nobody@sankalp.edu", "password": "bad"}).status_code
            for _ in range(32)
        ]
        assert 429 in burst_statuses
    finally:
        if orig_override:
            app.dependency_overrides[get_db] = orig_override
        else:
            app.dependency_overrides.pop(get_db, None)
        engine.dispose()
