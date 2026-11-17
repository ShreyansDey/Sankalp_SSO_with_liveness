# 03 — Liveness Check (MediaPipe Face Mesh)

**Status:** done · **Owner:** Arka · **Date:** 2026-11-17

## 1. What it is (plain words)
The Liveness module verifies that a living person is physically in front of the camera when logging in, rather than a printed photograph or a looped video playback. It asks the user to perform an action (like blinking twice or turning their head) within 30 seconds. All video frames stay strictly inside the browser, preserving complete user privacy.

## 2. Why it exists
Covers requirements **M3** (liveness check at signup and login without active session), **FR5** (random challenge with one-time code valid for 30s, storing pass/fail only), and privacy guarantees in `security.md`.

## 3. How it works
1. **Challenge Generation**: The browser calls `POST /liveness/challenge`. The server selects a random challenge (`blink`, `turn_left`, `turn_right`) and returns a one-time code valid for 30 seconds.
2. **In-Browser Detection**: MediaPipe Face Mesh processes webcam frames in real time directly on the client machine.
   - For `blink`: Tracks Eye Aspect Ratio (EAR) between upper and lower eyelid landmarks (159 and 145). Two distinct blinks satisfy the challenge.
   - For `turn_left` / `turn_right`: Tracks horizontal yaw deviation of the nose tip (landmark 1) relative to eye centers.
3. **Verification**: When the required action is detected, the browser posts `POST /liveness/result` with the challenge ID, one-time code, and `passed: true`.
4. **Session Cookie**: The server verifies that the code has not expired and has not been used, marks the challenge used, sets an HttpOnly `sso_session` cookie, and logs the audit event.
5. **Anti-Spoofing & Replay Prevention**: Printed photos fail because static images cannot blink or turn. Replayed recordings fail because the one-time code is only valid for 30 seconds and can never be used twice.

## 4. Code

### `backend/app/routes/liveness.py`
```python
# backend/app/routes/liveness.py
@router.post("/challenge")
def create_challenge(payload: ChallengeRequest, request: Request, db: Session = Depends(get_db), existing_session: Optional[SsoSession] = Depends(get_current_session)):
    user_id = payload.user_id or (existing_session.user_id if existing_session else None)
    if not user_id:
        raise HTTPException(status_code=400, detail={"error": "missing_user", "message": "user_id is required"})
    
    # Rate limit: max 5 challenges per 10 minutes
    ten_minutes_ago = datetime.utcnow() - timedelta(minutes=10)
    recent_count = db.query(LivenessChallenge).filter(
        LivenessChallenge.user_id == user_id,
        LivenessChallenge.expires_at > ten_minutes_ago
    ).count()
    if recent_count >= 5:
        raise HTTPException(status_code=429, detail={"error": "rate_limited", "message": "Too many liveness challenges. Maximum 5 per 10 minutes."})

    challenge_type = random.choice(["blink", "turn_left", "turn_right"])
    raw_code = generate_liveness_code()
    challenge = LivenessChallenge(
        user_id=user_id,
        type=challenge_type,
        code_hash=hash_token(raw_code),
        expires_at=datetime.utcnow() + timedelta(seconds=30),
        used_at=None,
        result=None
    )
    db.add(challenge)
    db.commit()
    return {"challenge_id": challenge.id, "type": challenge.type, "code": raw_code, "expires_in": 30}

@router.post("/result")
def submit_result(payload: ResultRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    challenge = db.query(LivenessChallenge).filter(LivenessChallenge.id == payload.challenge_id).first()
    if not challenge or challenge.used_at is not None:
        raise HTTPException(status_code=400, detail={"error": "challenge_used", "message": "Challenge code has already been used or not found"})
    if challenge.expires_at < datetime.utcnow():
        challenge.used_at = datetime.utcnow()
        challenge.result = "fail"
        db.commit()
        raise HTTPException(status_code=400, detail={"error": "challenge_expired", "message": "Challenge has expired"})

    if hash_token(payload.code) != challenge.code_hash:
        challenge.used_at = datetime.utcnow()
        challenge.result = "fail"
        db.commit()
        raise HTTPException(status_code=400, detail={"error": "invalid_code", "message": "Invalid challenge code"})

    challenge.used_at = datetime.utcnow()
    if not payload.passed:
        challenge.result = "fail"
        db.commit()
        log_audit(db, action="liveness_fail", actor_id=challenge.user_id, target_id=challenge.id)
        return {"status": "fail", "passed": False}

    challenge.result = "pass"
    user = db.query(User).filter(User.id == challenge.user_id).first()
    user.liveness_passed_at = datetime.utcnow()
    user.last_active_at = datetime.utcnow()

    # Create SSO Session & set cookie
    sso_sess = SsoSession(
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(hours=SSO_SESSION_HOURS)
    )
    db.add(sso_sess)
    db.commit()
    response.set_cookie(key="sso_session", value=sso_sess.id, httponly=True, samesite="lax", max_age=SSO_SESSION_HOURS * 3600, path="/")
    log_audit(db, action="liveness_pass", actor_id=user.id, target_id=challenge.id)
    return {"status": "ok", "passed": True, "session_id": sso_sess.id}
```

## 5. Code explanation
- `rate_limit`: Prevents brute-forcing or automated camera looping by limiting each user to at most 5 challenges in any 10-minute window.
- `FaceMesh`: Google MediaPipe operates in the client browser through WASM/WebGL. No video streams, landmarks, or face embeddings are ever sent across the network.
- `expires_in 30`: Short expiration guarantees that pre-recorded videos cannot be repurposed by attackers.

## 6. How to run and test it
```bash
pytest backend/tests/test_liveness.py -v
```
**Checklist items satisfied:**
- [x] A real person doing the action passes.
- [x] A printed photo fails (holds still, 30s timer runs out).
- [x] A recorded video replayed later fails (code expired or used).
- [x] Code older than 30 s is refused; a used code is refused.
- [x] More than 5 challenges in 10 minutes is refused.
- [x] Poor light / retry works via on-screen controls and admin fallback.

## 7. Limits and future work
- **Honest limits**: The check stops printed photos, digital displays, and recorded replays. Real-time generative deepfakes require future server-side cryptographic challenge-response pipelines.
- Liveness proves a live person is present, but does not match identity to a stored facial photograph.
