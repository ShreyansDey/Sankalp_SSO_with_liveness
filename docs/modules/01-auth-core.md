# 01 — Auth Core (Signup, Login, Sessions)

**Status:** done · **Owner:** Shaan · **Date:** 2026-11-17

## 1. What it is (plain words)
The Auth Core handles how users create an account from an admin invitation, how they log in with their email and password, and how central login sessions are established and terminated. It ensures that only legitimate members can log in and that passwords are never stored in plain text.

## 2. Why it exists
Covers requirements **M1** (invite-based signup), **M2** (login with email and password), **FR1** (account states: active, disabled, deleted; logout never deletes an account), and **FR4** (access tokens and refresh tokens).

## 3. How it works
1. **Invite Verification**: When an admin invites a member, an invite token is generated and hashed. The member receives a link with the raw token. During signup, the server hashes the submitted token to verify it exists, has not been used, and has not expired.
2. **Password Protection**: Passwords must be at least 8 characters long and are hashed using the state-of-the-art Argon2 password hashing algorithm.
3. **Session Establishment**: When a user logs in, their password is verified. If they do not have an active central session, the system mandates a liveness verification check before granting an SSO session cookie (`sso_session`).
4. **Logout**: When logging out, the session is marked revoked in the database and the cookie is deleted. The user's account remains intact.

## 4. Code

### `backend/app/models.py` (User & Invite & SsoSession extracts)
```python
# backend/app/models.py
class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="member")
    status = Column(String(50), nullable=False, default="active")
    term_end = Column(Date, nullable=True)
    last_active_at = Column(DateTime, nullable=True)
    liveness_passed_at = Column(DateTime, nullable=True)
    disabled_at = Column(DateTime, nullable=True)
    disabled_reason = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

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
```

### `backend/app/routes/auth.py`
```python
# backend/app/routes/auth.py
@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    token_h = hash_token(payload.invite_token)
    invite = db.query(Invite).filter(Invite.token_hash == token_h).first()
    if not invite or invite.used_at is not None or invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail={"error": "invalid_invite", "message": "Invite token is invalid or expired"})
    
    new_user = User(
        email=invite.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=invite.role,
        status="active",
        term_end=invite.term_end,
        created_at=datetime.utcnow(),
        last_active_at=datetime.utcnow()
    )
    db.add(new_user)
    invite.used_at = datetime.utcnow()
    db.commit()
    log_audit(db, action="signup", actor_id=new_user.id, target_id=new_user.id)
    return {"status": "ok", "next": "liveness", "user_id": new_user.id, "email": new_user.email}

@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db), existing_session: Optional[SsoSession] = Depends(get_current_session)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        log_audit(db, action="login_fail", actor_id=user.id if user else None)
        raise HTTPException(status_code=401, detail={"error": "invalid_credentials", "message": "Invalid email or password"})
    if user.status != "active":
        log_audit(db, action="access_denied", actor_id=user.id)
        raise HTTPException(status_code=403, detail={"error": "account_disabled", "message": f"Account is {user.status}"})
    if existing_session and existing_session.user_id == user.id:
        log_audit(db, action="login_ok", actor_id=user.id)
        return {"status": "ok", "next": "authenticated", "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role}}
    return {"status": "ok", "next": "liveness", "user_id": user.id, "email": user.email}
```

## 5. Code explanation
- `hash_password(password)` uses Argon2 with memory cost 64MB and 2 time iterations to provide high resistance against offline GPU/ASIC password cracking.
- `hash_token(token)` creates a SHA-256 digest of arbitrary tokens to enable fast, constant-time database index lookups without persisting raw tokens in cleartext.
- `signup` ensures atomicity: creating the user record and marking the invitation as `used_at` occur within a single database transaction.
- `login` strictly differentiates between active users and disabled accounts, returning a standardized `403 account_disabled` when access has been revoked.

## 6. How to run and test it
Run backend automated unit and integration tests:
```bash
pytest backend/tests/test_auth.py -v
```
**Checklist items satisfied:**
- [x] Signup from a valid invite works; an expired or used invite is refused.
- [x] Login with a wrong password fails and is logged.
- [x] A disabled user cannot log in.
- [x] Logout keeps the account; logging in again needs the camera check.

## 7. Limits and future work
Current implementation enforces minimum password length of 8 characters. Multi-Factor Authentication (TOTP authenticator app support) is planned as future work for environments requiring hardware token keys.
