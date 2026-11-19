import os
import sys
from datetime import datetime, date, timedelta
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.database import engine, SessionLocal, Base
from app.models import User, Product, Invite
from app.security import hash_password, hash_token, generate_random_token

def seed():
    print(" Initializing database schema...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        print(" Seeding initial demo users and products...")

        # 1. Admin user
        admin = db.query(User).filter(User.email == "admin@jadavpur.edu").first()
        if not admin:
            admin = User(
                email="admin@jadavpur.edu",
                name="Sankalp Admin",
                password_hash=hash_password("AdminPassword123!"),
                role="admin",
                status="active",
                created_at=datetime.utcnow(),
                last_active_at=datetime.utcnow()
            )
            db.add(admin)
            print("   ✅ Created Admin: admin@jadavpur.edu / AdminPassword123!")
        else:
            print("   ℹ️ Admin already exists.")

        # 2. Rahul (Demo Member)
        rahul = db.query(User).filter(User.email == "rahul@club.edu").first()
        if not rahul:
            rahul = User(
                email="rahul@club.edu",
                name="Rahul Sharma",
                password_hash=hash_password("RahulPassword123!"),
                role="member",
                status="active",
                term_end=date.today() + timedelta(days=180),
                created_at=datetime.utcnow() - timedelta(days=60),
                last_active_at=datetime.utcnow()
            )
            db.add(rahul)
            print("   ✅ Created Rahul: rahul@club.edu / RahulPassword123!")
        else:
            # Ensure Rahul is active for demo
            rahul.status = "active"
            rahul.disabled_reason = None
            rahul.disabled_at = None
            print("   ℹ️ Rahul reset to active status.")

        # 3. Expired Member (For Step 5 of demo)
        expired_user = db.query(User).filter(User.email == "expired@club.edu").first()
        if not expired_user:
            expired_user = User(
                email="expired@club.edu",
                name="Past Student (Arun)",
                password_hash=hash_password("ExpiredPassword123!"),
                role="member",
                status="active",
                term_end=date.today() - timedelta(days=30),  # expired 30 days ago
                created_at=datetime.utcnow() - timedelta(days=200),
                last_active_at=datetime.utcnow() - timedelta(days=35)
            )
            db.add(expired_user)
            print("   ✅ Created Expired Member: expired@club.edu / ExpiredPassword123!")
        else:
            expired_user.status = "active"
            expired_user.term_end = date.today() - timedelta(days=30)
            print("   ℹ️ Expired user reset to active with past term_end.")

        # 4. Long-inactive Member
        inactive_user = db.query(User).filter(User.email == "inactive@club.edu").first()
        if not inactive_user:
            inactive_user = User(
                email="inactive@club.edu",
                name="Inactive Alum (Pooja)",
                password_hash=hash_password("InactivePassword123!"),
                role="member",
                status="active",
                term_end=None,
                created_at=datetime.utcnow() - timedelta(days=120),
                last_active_at=datetime.utcnow() - timedelta(days=90)  # > 60 days
            )
            db.add(inactive_user)
            print("   ✅ Created Inactive Member: inactive@club.edu / InactivePassword123!")

        # 5. Connected University Products: 5 Active Clubs
        # Each club represents an independent university portal with its own client ID,
        # secret hash, and registered redirect URL. Only registered redirect URLs are honored.
        clubs_data = [
            {
                "name": "Photography Club",
                "client_id": "app-a",
                "secret": "secret-app-a-key-2026",
                "redirect_uri": "http://localhost:5174/callback"
            },
            {
                "name": "Robotics Lab",
                "client_id": "app-b",
                "secret": "secret-app-b-key-2026",
                "redirect_uri": "http://localhost:5175/callback"
            },
            {
                "name": "Coding & AI Club",
                "client_id": "app-c",
                "secret": "secret-app-c-key-2026",
                "redirect_uri": "http://localhost:5176/callback"
            },
            {
                "name": "Chess & Mind Sports",
                "client_id": "app-d",
                "secret": "secret-app-d-key-2026",
                "redirect_uri": "http://localhost:5177/callback"
            },
            {
                "name": "Athletics & Sports",
                "client_id": "app-e",
                "secret": "secret-app-e-key-2026",
                "redirect_uri": "http://localhost:5178/callback"
            }
        ]

        for club in clubs_data:
            existing = db.query(Product).filter(Product.client_id == club["client_id"]).first()
            if not existing:
                prod = Product(
                    name=club["name"],
                    client_id=club["client_id"],
                    client_secret_hash=hash_token(club["secret"]),
                    redirect_uri=club["redirect_uri"]
                )
                db.add(prod)
                print(f"   ✅ Registered Product: {club['name']} ({club['client_id']} on {club['redirect_uri']})")
            else:
                existing.name = club["name"]
                existing.redirect_uri = club["redirect_uri"]
                print(f"   ℹ️ Product already registered: {club['name']} ({club['client_id']})")

        # 6. Sample Invite Token
        sample_invite = db.query(Invite).filter(Invite.email == "newstudent@jadavpur.edu").first()
        if not sample_invite:
            raw_inv = "demo-invite-token-12345"
            sample_invite = Invite(
                email="newstudent@jadavpur.edu",
                role="member",
                term_end=date.today() + timedelta(days=365),
                token_hash=hash_token(raw_inv),
                expires_at=datetime.utcnow() + timedelta(days=14)
            )
            db.add(sample_invite)
            print("   ✅ Created Sample Invite: token='demo-invite-token-12345'")

        db.commit()
        print("🎉 Database seeding complete successfully!")

    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding database: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed()
