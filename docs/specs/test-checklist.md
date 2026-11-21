# test-checklist.md — Quality Assurance & Verification Matrix

**Project:** Real Person, Real Access · **Product:** Sankalp SSO  
**Team:** Sankalp (Shreyans Dey, Arka Paul) · **Event:** Hack N Pitch 2026, Jadavpur University E-Cell  

---

## 📋 1. Functional Verification Checklist

### 1.1. Single Sign-On (SSO) & Token Management
- [x] **TC-SSO-01**: Opening App A (`:5174`) without session redirects cleanly to central login (`:5173/login`).
- [x] **TC-SSO-02**: Successful login returns 60-second one-time authorization code in redirect callback.
- [x] **TC-SSO-03**: App A exchanges authorization code for 10-minute JWT `access_token` and revocable `refresh_token`.
- [x] **TC-SSO-04**: Authorization code is single-use; attempting to exchange the same code twice returns `400 invalid_grant`.
- [x] **TC-SSO-05**: Authorization code expires after 60 seconds; exchange attempts after 60s fail.
- [x] **TC-SSO-06**: Unauthorized redirect URI mismatch returns `400 invalid_redirect_uri`.
- [x] **TC-SSO-07**: Navigating from App A to App B (`:5175`) detects live `sso_session` cookie; opens instantly with **1 click** (0.35s).
- [x] **TC-SSO-08**: Token refresh (`POST /token/refresh`) issues new 10-minute JWT for active users.

### 1.2. e-KYC Onboarding & Administrator Review Desk
- [x] **TC-KYC-01**: Admin issues invite with expiration date; raw token is delivered in link.
- [x] **TC-KYC-02**: Accepting invite with webcam portrait and student ID document creates account in `pending_approval` state.
- [x] **TC-KYC-03**: Applicant attempting login while `pending_approval` is blocked with `403 account_pending_approval`.
- [x] **TC-KYC-04**: Admin Console (`:5173/admin`) displays pending applications with live photo and document previews.
- [x] **TC-KYC-05**: Admin clicking **"Approve & Activate"** transitions account to `active`; user can now sign in.
- [x] **TC-KYC-06**: Admin clicking **"Reject"** transitions account to `disabled` (`application_rejected`).

### 1.3. Liveness Detection & Biometric Face Verification
- [x] **TC-LIVE-01**: Server issues random challenge direction (`turn_left` or `turn_right`) with 30s code.
- [x] **TC-LIVE-02**: Requesting more than 5 challenges in 10 minutes returns `429 rate_limited`.
- [x] **TC-LIVE-03**: MediaPipe Face Mesh detects 3D head yaw turn matching challenged direction.
- [x] **TC-LIVE-04**: Dynamic EAR baseline calibrates open-eye geometry while user looks directly at center.
- [x] **TC-LIVE-05**: Natural 2-blink detection captures genuine eye closures while discarding 1-frame glitches.
- [x] **TC-LIVE-06**: Presentation attack with flat 2D color photo is blocked by 3D Z-depth variance check ($\sigma_Z < 0.015$).
- [x] **TC-LIVE-07**: Verified frame snapshot is compared via SFace against enrolled 128D embedding.
- [x] **TC-LIVE-08**: Genuine user ($\text{Cosine Sim} \ge 0.40$) passes and receives `sso_session` cookie.
- [x] **TC-LIVE-09**: Impostor user passing liveness with non-matching face is rejected with `401 face_mismatch`.

### 1.4. Access Revocation, 48-Hour Recovery Window & Automated Janitor
- [x] **TC-REV-01**: Admin clicks **"Mark as left"**; user status set to `disabled` and all sessions/tokens revoked.
- [x] **TC-REV-02**: Refreshing App A or App B immediately renders bright red **ACCESS DENIED** card in $< 0.2$s.
- [x] **TC-REV-03**: Disabled user attempting login is rejected with `403 account_disabled`.
- [x] **TC-REV-04**: Manual cleanup trigger (`POST /admin/cleanup/run`) disables accounts past their `term_end` date.
- [x] **TC-REV-05**: Inactive accounts ($> 60$ days without activity) are automatically disabled.
- [x] **TC-REV-06**: Deletion safeguard: account deletion is strictly refused before 30 days have elapsed since `disabled_at`.
- [x] **TC-REV-07**: Revocation & Expiration 48-Hour Email: User receives notification with hyperlinked renewal button and prominent red disregard note.
- [x] **TC-REV-08**: 48-Hour Renewal Submission (`POST /auth/renew`): Disabled user submits renewal request with reason; listed in Admin Renewals Desk with countdown.
- [x] **TC-REV-09**: Admin Renewal Resolution: Approving reactivates account and cancels purge; declining logs event and notifies user.
- [x] **TC-REV-10**: 48-Hour Hard Purge: Janitor permanently erases user records and files after 48 hours without approved renewal (`user_purged_permanently`).

### 1.5. Security Audit Log & Privacy
- [x] **TC-AUD-01**: All 24 fixed audit actions are correctly recorded with timestamp and actor ID.
- [x] **TC-AUD-02**: Sensitive credentials (`password`, `token`, `secret`, `hash`) are stripped by sanitization filter.
- [x] **TC-AUD-03**: Database contains unit-normalized 128D mathematical vectors; zero continuous video stored.

### 1.6. Administrator Biometric Face Lock & Security Alerts
- [x] **TC-AFL-01**: Admin registers authorized biometric face profile (`POST /admin/face-profiles`); embedding stored in `admin_faces`.
- [x] **TC-AFL-02**: Admin Face Lock restriction toggle (`POST /admin/face-profiles/toggle-restriction`) enforces biometric facial matching on admin logins.
- [x] **TC-AFL-03**: Non-authorized face attempting admin login when face lock is active is rejected with `401 face_mismatch`.
- [x] **TC-ALT-01**: Successful login asynchronously delivers alert email to user with IP, User-Agent, and IST timestamp.
- [x] **TC-ALT-02**: Password reset asynchronously dispatches password changed alert email and revokes all active sessions.
- [x] **TC-INV-01**: Admin creating an invite automatically sends invitation email to candidate with pre-authorized link.

---

## 📊 2. Measured Benchmark Performance

| Measurement / Test Metric | Target Benchmark | Actual Observed Result | Pass / Fail |
|---|---|---|---|
| **Time to Deny Access (Mark as Left to Denied)** | $< 0.5$ seconds | **$< 0.2$ seconds** | **PASS** |
| **SSO Cross-Product Switch Latency** | $< 2.0$ seconds | **0.35 seconds** | **PASS** |
| **Biometric Face Feature Extraction Time** | $< 50$ ms | **24 ms (Intel i5 CPU)** | **PASS** |
| **Presentation Attack False Acceptance (Photos/Screens)** | $0\%$ | **$0\%$ (0 accepted / 25 attempts)** | **PASS** |
| **Legitimate User False Rejection Rate** | $< 5\%$ | **$3.3\%$ (1 / 30, resolved on retry)** | **PASS** |
| **Authorization Code Expiration Window** | Exactly 60 seconds | **60 seconds (Enforced)** | **PASS** |
| **Liveness Challenge Code Window** | Exactly 30 seconds | **30 seconds (Enforced)** | **PASS** |
| **Password Reset Token Expiration** | Exactly 15 minutes | **15 minutes (Enforced)** | **PASS** |
