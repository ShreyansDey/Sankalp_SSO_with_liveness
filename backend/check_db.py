"""
Sankalp SSO — Database Inspector & Health Check Utility
Run this anytime from terminal:
    cd backend
    .\\.venv\\Scripts\\python.exe check_db.py
"""

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.database import SessionLocal, engine, Base
import app.models  # Ensure all ORM models are registered
from app.models import User, Product, LivenessChallenge, SsoSession, AuditLog, Invite, RenewalRequest

def inspect_db():
    print("\n" + "=" * 80)
    print(" SANKALP SSO — DATABASE STORAGE INSPECTION")
    print("=" * 80)
    print(f" Database URL: {engine.url}\n")

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # 1. USERS & BIOMETRICS
        users = db.query(User).order_by(User.created_at.desc()).all()
        print(f"--- 1. REGISTERED USERS ({len(users)} Total) ---")
        if not users:
            print("  (No users found in database)")
        for u in users:
            has_emb = "YES (128-D Vector)" if u.face_embedding else "NO"
            doc = "Present" if u.document_path else "None"
            photo = "Present" if u.face_photo_path else "None"
            liveness = u.liveness_passed_at.strftime("%Y-%m-%d %H:%M:%S") if u.liveness_passed_at else "Never"
            print(f" • Email: {u.email:<28} | Name: {u.name or 'N/A'}")
            print(f"   - Role: {u.role:<8} | Status: {u.status:<16} | Phone: {u.phone or 'N/A'}")
            print(f"   - Face Embedding Enrolled: {has_emb}")
            print(f"   - Photo on Disk: {photo} | Document on Disk: {doc}")
            print(f"   - Last Liveness Pass: {liveness}")
            print(f"   - Created At: {u.created_at.strftime('%Y-%m-%d %H:%M:%S') if u.created_at else 'N/A'}")
            print()

        # 2. RECENT LIVENESS CHALLENGES
        challenges = db.query(LivenessChallenge).order_by(LivenessChallenge.expires_at.desc()).limit(5).all()
        print(f"--- 2. RECENT LIVENESS ATTEMPTS (Last {len(challenges)}) ---")
        if not challenges:
            print("  (No liveness challenges recorded yet)")
        for c in challenges:
            res = c.result or "pending/in-progress"
            used = c.used_at.strftime("%H:%M:%S") if c.used_at else "Not Used"
            print(f" • Type: {c.type:<12} | Result: {res:<6} | User ID: {c.user_id[:8]}... | Used At: {used}")
        print()

        # 3. ACTIVE SSO SESSIONS
        sessions = db.query(SsoSession).order_by(SsoSession.created_at.desc()).limit(5).all()
        print(f"--- 3. SSO LOGIN SESSIONS (Last {len(sessions)}) ---")
        if not sessions:
            print("  (No active login sessions recorded)")
        for s in sessions:
            status_str = "REVOKED" if s.revoked_at else "ACTIVE"
            user_rec = db.query(User).filter(User.id == s.user_id).first()
            user_email = user_rec.email if user_rec else s.user_id[:8]
            print(f" • User: {user_email:<26} | Status: {status_str:<7} | Expires: {s.expires_at.strftime('%H:%M:%S')}")
        print()

        # 4. RECENT AUDIT LOGS
        logs = db.query(AuditLog).order_by(AuditLog.at.desc()).limit(8).all()
        print(f"--- 4. AUDIT TRAIL LOGS (Last {len(logs)}) ---")
        if not logs:
            print("  (No audit logs found)")
        for l in logs:
            log_time = l.at.strftime('%H:%M:%S') if l.at else "N/A"
            print(f" • [{log_time}] Action: {l.action:<20} | Detail: {l.detail}")
        print()

        # 5. REGISTERED PRODUCTS & CLIENT APPS
        products = db.query(Product).order_by(Product.name).all()
        print(f"--- 5. REGISTERED CONNECTED PRODUCTS ({len(products)} Total) ---")
        if not products:
            print("  (No products registered)")
        for p in products:
            print(f" • {p.name:<24} | Client ID: {p.client_id:<12} | Callback: {p.redirect_uri}")
        print()

        # 6. DATABASE SUMMARY
        print("--- 6. TABLE ROW COUNTS ---")
        print(f" • Users: {len(users)} | Products: {len(products)} | Invites: {db.query(Invite).count()}")
        print(f" • SSO Sessions: {db.query(SsoSession).count()} | Liveness Logs: {db.query(LivenessChallenge).count()} | Audit Logs: {db.query(AuditLog).count()}")
        print(f" • Renewal Requests: {db.query(RenewalRequest).count()}")
        print()

    except Exception as e:
        print(f"❌ Error connecting to database: {e}")
    finally:
        db.close()
    print("=" * 80 + "\n")

if __name__ == "__main__":
    inspect_db()
