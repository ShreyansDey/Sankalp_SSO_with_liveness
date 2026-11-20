import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Date, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="member")  # admin, member
    status = Column(String(50), nullable=False, default="active")  # active, pending_approval, disabled, deleted
    term_end = Column(Date, nullable=True)
    last_active_at = Column(DateTime, nullable=True)
    liveness_passed_at = Column(DateTime, nullable=True)
    disabled_at = Column(DateTime, nullable=True)
    disabled_reason = Column(String(50), nullable=True)  # left, term_end, inactive, admin, application_rejected
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # e-KYC and Biometric Face Identity Fields
    face_embedding = Column(JSON, nullable=True)  # 128-dimensional float embedding vector
    document_path = Column(String(500), nullable=True)  # Stored path of supporting document
    face_photo_path = Column(String(500), nullable=True)  # Stored path of live enrollment face photo
    approved_at = Column(DateTime, nullable=True)  # Timestamp when admin approved application
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)  # Admin user id

    sso_sessions = relationship("SsoSession", back_populates="user", cascade="all, delete-orphan")
    auth_codes = relationship("AuthCode", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    liveness_challenges = relationship("LivenessChallenge", back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")

class Invite(Base):
    __tablename__ = "invites"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(50), nullable=False, default="member")
    term_end = Column(Date, nullable=True)
    token_hash = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)

class Product(Base):
    __tablename__ = "products"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    client_id = Column(String(100), unique=True, nullable=False, index=True)
    client_secret_hash = Column(String(255), nullable=False)
    redirect_uri = Column(String(500), nullable=False)

    auth_codes = relationship("AuthCode", back_populates="product", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="product", cascade="all, delete-orphan")

class SsoSession(Base):
    __tablename__ = "sso_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    ip = Column(String(100), nullable=True)
    user_agent = Column(Text, nullable=True)

    user = relationship("User", back_populates="sso_sessions")

class AuthCode(Base):
    __tablename__ = "auth_codes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    code_hash = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)  # 60 s
    used_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="auth_codes")
    product = relationship("Product", back_populates="auth_codes")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    token_hash = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="refresh_tokens")
    product = relationship("Product", back_populates="refresh_tokens")

class LivenessChallenge(Base):
    __tablename__ = "liveness_challenges"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)  # blink, turn_left, turn_right
    code_hash = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)  # 30 s
    used_at = Column(DateTime, nullable=True)
    result = Column(String(20), nullable=True)  # pass, fail, or None

    user = relationship("User", back_populates="liveness_challenges")

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    actor_id = Column(String(36), nullable=True, index=True)  # user id or system
    action = Column(String(100), nullable=False, index=True)
    target_id = Column(String(36), nullable=True, index=True)  # user id or product id
    detail = Column(JSON, nullable=True)

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="password_reset_tokens")
