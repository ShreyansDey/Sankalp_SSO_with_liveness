from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import DATABASE_URL

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def ensure_columns_exist():
    """Ensure newly added columns exist in both PostgreSQL and SQLite without dropping data."""
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            url_str = str(engine.url).lower()
            if "postgresql" in url_str:
                pg_cols = [
                    ("phone", "VARCHAR(50)"),
                    ("face_embedding", "JSON"),
                    ("document_path", "VARCHAR(500)"),
                    ("face_photo_path", "VARCHAR(500)"),
                    ("approved_at", "TIMESTAMP"),
                    ("approved_by", "VARCHAR(36)")
                ]
                for col_name, col_type in pg_cols:
                    try:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                        conn.commit()
                    except Exception:
                        conn.rollback()
            elif "sqlite" in url_str:
                res = conn.execute(text("PRAGMA table_info(users)")).fetchall()
                existing_cols = {row[1] for row in res}
                cols_to_add = [
                    ("phone", "VARCHAR(50)"),
                    ("face_embedding", "JSON"),
                    ("document_path", "VARCHAR(500)"),
                    ("face_photo_path", "VARCHAR(500)"),
                    ("approved_at", "DATETIME"),
                    ("approved_by", "VARCHAR(36)")
                ]
                for col_name, col_type in cols_to_add:
                    if col_name not in existing_cols:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                conn.commit()
    except Exception as e:
        print(f"Warning during column check: {e}")

# Run on import
Base.metadata.create_all(bind=engine)
ensure_columns_exist()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
