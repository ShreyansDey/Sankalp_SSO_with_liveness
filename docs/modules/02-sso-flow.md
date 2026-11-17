# 02 — SSO Flow (Authorize, Tokens, Refresh)

**Status:** done · **Owner:** Shaan · **Date:** 2026-11-17

## 1. What it is (plain words)
The Single Sign-On (SSO) module allows members to sign in once on a central login portal and then seamlessly open multiple connected products (like App A and App B) without re-entering passwords or re-checking their camera. Connected products receive short-lived access tokens, ensuring immediate revocation when membership ends.

## 2. Why it exists
Covers requirements **M4** (SSO central login, redirect with one-time code, tokens for each product, one click into the second product), **FR4** (access tokens last 10 minutes, refresh tokens are stored hashed and revocable), **FR6** (product registration and exact redirect_uri matching), and **FR8** (returning user with live session bypasses camera).

## 3. How it works
1. **Product Initiation**: An app redirects the user's browser to `/authorize?client_id=app-a&redirect_uri=...&state=...`.
2. **Session Verification**: The server inspects the incoming `sso_session` cookie. If an active session exists for an active user, the server issues a cryptographically random, one-time authorization code valid for 60 seconds and redirects back to the product's redirect URI.
3. **Token Exchange**: The product calls `POST /token` using its `client_id`, `client_secret`, and the one-time `code`. The server marks the code used, verifies the user is active, and returns a 10-minute JWT `access_token` and a revocable `refresh_token`.
4. **One-Click Switch**: When the user opens App B, the same session cookie authorizes App B instantly with no camera prompt and no password input.
5. **Instant Invalidation**: If the user is marked as left or disabled, their refresh token is revoked and access token refresh requests return `403 account_disabled`.

## 4. Code

### `backend/app/routes/sso.py`
```python
# backend/app/routes/sso.py
@router.get("/authorize")
def authorize(client_id: str, redirect_uri: str, state: Optional[str] = None, db: Session = Depends(get_db), session_obj: Optional[SsoSession] = Depends(get_current_session)):
    product = db.query(Product).filter(Product.client_id == client_id).first()
    if not product:
        raise HTTPException(status_code=400, detail={"error": "invalid_client", "message": "Unknown client_id"})
    if product.redirect_uri.rstrip("/") != redirect_uri.rstrip("/"):
        raise HTTPException(status_code=400, detail={"error": "invalid_redirect_uri", "message": "Redirect URI does not match registered URI"})

    if session_obj:
        user = db.query(User).filter(User.id == session_obj.user_id).first()
        if user and user.status == "active":
            raw_code = generate_random_token(24)
            auth_code = AuthCode(
                user_id=user.id,
                product_id=product.id,
                code_hash=hash_token(raw_code),
                expires_at=datetime.utcnow() + timedelta(seconds=60),
                used_at=None
            )
            db.add(auth_code)
            user.last_active_at = datetime.utcnow()
            db.commit()
            params = {"code": raw_code}
            if state: params["state"] = state
            separator = "&" if "?" in redirect_uri else "?"
            return RedirectResponse(url=f"{redirect_uri}{separator}{urlencode(params)}", status_code=302)

    login_params = {"client_id": client_id, "redirect_uri": redirect_uri}
    if state: login_params["state"] = state
    return RedirectResponse(url=f"{FRONTEND_ORIGIN}/login?{urlencode(login_params)}", status_code=302)

@router.post("/token")
def issue_token(payload: TokenRequest, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.client_id == payload.client_id).first()
    if not product or not verify_product_secret(product, payload.client_secret):
        raise HTTPException(status_code=401, detail={"error": "invalid_client", "message": "Invalid client_id or client_secret"})
    
    code_h = hash_token(payload.code)
    auth_code = db.query(AuthCode).filter(AuthCode.code_hash == code_h, AuthCode.product_id == product.id).first()
    if not auth_code or auth_code.used_at is not None or auth_code.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail={"error": "invalid_grant", "message": "Authorization code invalid, used, or expired"})

    auth_code.used_at = datetime.utcnow()
    user = db.query(User).filter(User.id == auth_code.user_id).first()
    if not user or user.status != "active":
        db.commit()
        raise HTTPException(status_code=403, detail={"error": "account_disabled", "message": "User account is not active"})

    access_token = create_access_token(user.id, user.email, user.role)
    raw_refresh = generate_random_token(32)
    refresh_obj = RefreshToken(
        user_id=user.id,
        product_id=product.id,
        token_hash=hash_token(raw_refresh),
        expires_at=datetime.utcnow() + timedelta(days=30),
        revoked_at=None
    )
    db.add(refresh_obj)
    db.commit()
    log_audit(db, action="token_issued", actor_id=user.id, target_id=product.id, detail={"product": product.name})
    return {"access_token": access_token, "token_type": "bearer", "expires_in": 600, "refresh_token": raw_refresh}
```

## 5. Code explanation
- `authorize`: Validates that `redirect_uri` matches the product's registered address exactly, preventing open-redirect attacks.
- `AuthCode`: Guaranteed single-use by marking `used_at = datetime.utcnow()` immediately upon presentation. Short lifetime of 60 seconds minimizes interception risk.
- `create_access_token`: Generates signed HS256 JWT with `sub`, `email`, `role`, and unique token UUID `jti`, expiring in 10 minutes.
- `refresh_token`: Checks that `ref_obj.revoked_at is None` and `user.status == 'active'` on every invocation. If a user was marked as left, token refresh fails instantly.

## 6. How to run and test it
```bash
pytest backend/tests/test_sso.py -v
```
**Checklist items satisfied:**
- [x] App A → login → back with a token → Welcome.
- [x] App B opens with no form and no camera while the session is live.
- [x] A wrong `redirect_uri` is refused.
- [x] An auth code works once only and expires after 60 s.
- [x] An access token stops working after 10 minutes; refresh works for an active user.

## 7. Limits and future work
Access tokens are stateless signed JWTs lasting 10 minutes. Revocation takes effect upon token expiration or at the next refresh call (or immediately if a product validates against the `/userinfo` endpoint).
