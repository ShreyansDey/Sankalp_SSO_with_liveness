from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import DATABASE_URL

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False, "timeout": 15}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    """Enable SQLite WAL mode, busy_timeout, and foreign key enforcement for concurrency & integrity."""
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_columns_exist():
    """Ensure newly added columns exist in both PostgreSQL and SQLite without dropping data."""
    try:
        with engine.connect() as conn:
            url_str = str(engine.url).lower()
            table_columns = {
                "users": [
                    ("phone", "VARCHAR(50)", "VARCHAR(50)"),
                    ("face_embedding", "JSON", "JSON"),
                    ("document_path", "VARCHAR(500)", "VARCHAR(500)"),
                    ("face_photo_path", "VARCHAR(500)", "VARCHAR(500)"),
                    ("approved_at", "TIMESTAMP", "DATETIME"),
                    ("approved_by", "VARCHAR(36)", "VARCHAR(36)"),
                    ("require_face_match", "BOOLEAN DEFAULT FALSE", "BOOLEAN DEFAULT FALSE"),
                    ("admin_faces", "JSON", "TEXT"),
                ],
                "auth_codes": [
                    ("code_challenge", "VARCHAR(255)", "VARCHAR(255)"),
                    ("code_challenge_method", "VARCHAR(20)", "VARCHAR(20)"),
                    ("redirect_uri", "VARCHAR(500)", "VARCHAR(500)"),
                ],
                "products": [
                    ("allowed_origins", "TEXT", "TEXT"),
                    ("api_only", "BOOLEAN DEFAULT FALSE", "BOOLEAN DEFAULT FALSE"),
                ],
            }
            if "postgresql" in url_str:
                for table_name, cols in table_columns.items():
                    for col_name, pg_type, _ in cols:
                        try:
                            conn.execute(
                                text(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {col_name} {pg_type}")
                            )
                            conn.commit()
                        except Exception:
                            conn.rollback()
            elif "sqlite" in url_str:
                for table_name, cols in table_columns.items():
                    res = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
                    existing_cols = {row[1] for row in res}
                    if existing_cols:
                        for col_name, _, sqlite_type in cols:
                            if col_name not in existing_cols:
                                conn.execute(
                                    text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {sqlite_type}")
                                )
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
