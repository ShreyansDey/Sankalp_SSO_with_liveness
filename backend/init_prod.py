"""
Production Initialization Script for Real Person, Real Access (Sankalp SSO).
Registers default demo applications with cryptographically random secrets
and optionally configures first-time superuser bootstrap from environment variables.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import (
    APP_A_ORIGIN,
    APP_B_ORIGIN,
    APP_C_ORIGIN,
    APP_D_ORIGIN,
    APP_E_ORIGIN,
    BOOTSTRAP_PASSWORD,
    BOOTSTRAP_USERNAME,
    SUPERUSER_CREATION_KEY,
)
from app.database import Base, SessionLocal, engine
from app.models import ApiKey, Product, SystemBootstrap, User
from app.security import generate_api_key, generate_random_token, hash_password, hash_token


def init_production():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if SUPERUSER_CREATION_KEY:
            boot = db.query(SystemBootstrap).filter(SystemBootstrap.id == "singleton").first()
            if not boot:
                boot = SystemBootstrap(
                    id="singleton",
                    primary_key_hash=hash_password(SUPERUSER_CREATION_KEY),
                    bootstrap_username=BOOTSTRAP_USERNAME or None,
                    bootstrap_password_hash=hash_password(BOOTSTRAP_PASSWORD) if BOOTSTRAP_PASSWORD else None,
                    setup_completed=False,
                )
                db.add(boot)
                print("Configured first-time superuser bootstrap primary key from environment.")

        admin_email = os.getenv("INITIAL_ADMIN_EMAIL")
        admin_password = os.getenv("INITIAL_ADMIN_PASSWORD")
        if admin_email and admin_password:
            if not db.query(User).filter(User.email == admin_email.strip().lower()).first():
                admin = User(
                    email=admin_email.strip().lower(),
                    name=os.getenv("INITIAL_ADMIN_NAME", "System Super Admin"),
                    password_hash=hash_password(admin_password),
                    role="admin",
                    status="active",
                )
                db.add(admin)
                boot = db.query(SystemBootstrap).filter(SystemBootstrap.id == "singleton").first()
                if boot:
                    boot.setup_completed = True
                print(f"Created initial admin account: {admin_email}")

        default_apps = [
            ("Campus Robotics Club Portal (App A)", "app-a", os.getenv("APP_A_SECRET"), f"{APP_A_ORIGIN}/index.html"),
            ("Science & Coding Society Portal (App B)", "app-b", os.getenv("APP_B_SECRET"), f"{APP_B_ORIGIN}/index.html"),
            ("Photography & Media Guild (App C)", "app-c", os.getenv("APP_C_SECRET"), f"{APP_C_ORIGIN}/index.html"),
            ("Cultural & Dramatics Society (App D)", "app-d", os.getenv("APP_D_SECRET"), f"{APP_D_ORIGIN}/index.html"),
            ("Robotics & AI Society (App E)", "app-e", os.getenv("APP_E_SECRET"), f"{APP_E_ORIGIN}/index.html"),
        ]
        for name, client_id, env_secret, redirect_uri in default_apps:
            if not db.query(Product).filter(Product.client_id == client_id).first():
                secret_val = env_secret or f"sec_{generate_random_token(24)}"
                db.add(
                    Product(
                        name=name,
                        client_id=client_id,
                        client_secret_hash=hash_token(secret_val),
                        redirect_uri=redirect_uri,
                    )
                )
                if not env_secret:
                    print(f"Registered {client_id} with generated random secret (store securely): {secret_val}")

        if os.getenv("MINT_INITIAL_API_KEY", "false").lower() == "true" and db.query(ApiKey).count() == 0:
            raw_key, prefix, key_hash = generate_api_key()
            db.add(ApiKey(name="Initial Production API Key", key_prefix=prefix, key_hash=key_hash, scopes=["*"]))
            print(f"Minted initial API key ({prefix}...): {raw_key}")

        db.commit()
        print("Production initialization completed cleanly.")
    finally:
        db.close()


if __name__ == "__main__":
    init_production()
