"""
Cross-OS CLI Key & Superuser Primary Key Generator for Sankalp SSO.
Configures the user-defined First-Time Superuser Creation Primary Key (and optional bootstrap username/password)
and mints a scoped Universal Integration API key (sk_live_...).
"""
import argparse
import getpass
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

from app.database import Base, SessionLocal, engine
from app.models import ApiKey, SystemBootstrap, User
from app.security import generate_api_key, hash_password


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Configure First-Time Superuser Primary Key and mint a Universal SSO API Key."
    )
    parser.add_argument("--name", default="Primary Integration Key", help="Friendly label for the API key")
    parser.add_argument(
        "--scopes",
        default="sso:read,sso:write,apps:manage,audit:read",
        help="Comma-separated scopes (or *)",
    )
    parser.add_argument("--primary-key", help="First-Time Superuser Creation Primary Key (min 12 chars)")
    parser.add_argument("--bootstrap-username", default="", help="Optional bootstrap username required on first setup")
    parser.add_argument("--bootstrap-password", default="", help="Optional bootstrap password required on first setup")
    parser.add_argument("--skip-primary-key", action="store_true", help="Only mint an API key without touching bootstrap config")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if not args.skip_primary_key:
            boot = db.query(SystemBootstrap).filter(SystemBootstrap.id == "singleton").first()
            admin_exists = db.query(User).filter(User.role == "admin", User.status != "deleted").first() is not None
            if (boot and boot.setup_completed) or admin_exists:
                print("Notice: Superuser setup is already completed; skipping primary key reconfiguration.")
            else:
                primary_key = args.primary_key
                if not primary_key:
                    primary_key = getpass.getpass("Enter YOUR First-Time Superuser Creation Primary Key (min 12 chars): ").strip()
                if len(primary_key) < 12:
                    print("Error: Primary key must be at least 12 characters long.", file=sys.stderr)
                    return 1

                boot_user = args.bootstrap_username.strip() or None
                boot_pass = args.bootstrap_password.strip() or None
                if boot_user and not boot_pass:
                    boot_pass = getpass.getpass("Enter Bootstrap Password for that username (min 8 chars): ").strip()

                if not boot:
                    boot = SystemBootstrap(id="singleton")
                    db.add(boot)
                boot.primary_key_hash = hash_password(primary_key)
                boot.bootstrap_username = boot_user
                boot.bootstrap_password_hash = hash_password(boot_pass) if boot_pass else None
                boot.setup_completed = False
                print("First-Time Superuser Creation Primary Key configured securely (Argon2 hashed).")

        raw_key, prefix, key_hash = generate_api_key()
        scopes = [s.strip() for s in args.scopes.split(",") if s.strip()]
        db.add(
            ApiKey(
                name=args.name.strip(),
                key_prefix=prefix,
                key_hash=key_hash,
                scopes=scopes,
                created_by="cli_generate_key",
            )
        )
        db.commit()

        print("\n=== Sankalp SSO Universal Integration API Key ===")
        print(f"Key Name : {args.name}")
        print(f"Scopes   : {', '.join(scopes)}")
        print(f"API Key  : {raw_key}")
        print("Save this API key securely now — it is hashed in the database and will NOT be shown again.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
