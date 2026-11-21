# api.md — Complete REST API Reference Manual

**Base URL**: `http://localhost:8000` (FastAPI Backend)  
**Standard Format**: JSON (`application/json`) unless redirecting or downloading binary images  
**Standard Error Schema**:
```json
{
  "error": "short_machine_code",
  "message": "Human-readable explanation of why the request failed"
}
```

---

## 📚 1. Primer for Complete Beginners: How Web APIs Work

If you have never built a web backend, here is how clients (browsers and apps) talk to this server:
1. **HTTP Methods**:
   - `GET`: Asks the server to retrieve information (e.g., "Give me the list of pending applications"). Does not alter data.
   - `POST`: Submits new data to the server to perform an action (e.g., "Here is a password, log me in" or "Save this new member").
2. **HTTP Status Codes**:
   - `200 OK`: Request succeeded perfectly.
   - `302 Found`: Temporary redirection (e.g., sending the browser back to a club app with an authorization code).
   - `400 Bad Request`: Client sent invalid or missing data (e.g., an expired invite code or a password shorter than 8 characters).
   - `401 Unauthorized`: Authentication failed (e.g., wrong password or invalid client secret).
   - `403 Forbidden`: Authenticated, but action is forbidden (e.g., member account is `disabled` or `pending_approval`).
   - `404 Not Found`: The requested resource does not exist.
   - `429 Too Many Requests`: Rate limit triggered (e.g., requesting more than 5 camera challenges in 10 minutes).
3. **Authentication Schemes**:
   - **Public**: Anyone can access (e.g., login or submitting registration).
   - **Cookie (`sso_session`)**: Browser automatically attaches the `sso_session` cookie to prove active central login.
   - **Bearer Access Token**: HTTP Header `Authorization: Bearer <jwt_token>` used by applications to fetch user identity.
   - **Admin Protected**: Requires the caller's active session to belong to a user with `role = "admin"`.

---

## 🔐 2. Authentication, Registration & e-KYC Endpoints

### 2.1. Submit e-KYC Membership Application (`POST /auth/apply`)
- **Purpose**: Used by an invited student to submit credentials, a live webcam photo, and an institutional document (student ID card).
- **Authentication**: Public (requires valid invite token).
- **Request Body**:
  ```json
  {
    "invite_token": "raw_32_byte_secret_from_email_link",
    "name": "Rahul Sharma",
    "password": "StrongPassword123!",
    "face_photo": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "document_base64": "data:application/pdf;base64,JVBERi0x...",
    "document_name": "ju_student_id.pdf"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "status": "ok",
      "next": "pending_approval",
      "user_id": "c7a8b9d0-1234-5678-90ab-cdef12345678",
      "email": "rahul@ju.edu",
      "message": "Application submitted successfully. Awaiting administrator review."
    }
    ```
  - `400 Bad Request`: Token expired, already used, or face could not be detected in photo.
- **Server Execution Logic**:
  1. Hashes `invite_token` with SHA-256 and searches `invites` table.
  2. Verifies invite is not expired and `used_at` is null.
  3. Uses OpenCV YuNet and SFace to locate face and extract unit-normalized 128D embedding.
  4. Saves face photo to `uploads/faces/` and document to `uploads/documents/`.
  5. Hashes password using Argon2id.
  6. Inserts user record with `status = "pending_approval"`.
  7. Marks invite as `used_at = NOW()`.
  8. Emits `application_submitted` event to audit log.

---

### 2.2. Self-Service Student Registration (`POST /auth/register`)
- **Purpose**: Allows prospective campus members to apply for an account without a prior invite.
- **Authentication**: Public.
- **Request Body**:
  ```json
  {
    "email": "ananya.roy@ju.edu",
    "name": "Ananya Roy",
    "phone": "+91 98765 43210",
    "password": "SecurePassword456!",
    "face_photo": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "document_base64": "data:image/png;base64,iVBORw0KGgo...",
    "document_name": "library_card.png"
  }
  ```
- **Responses**:
  - `200 OK`: Account created in `pending_approval` status.
  - `400 Bad Request`: Email already registered or invalid inputs.

---

### 2.3. Invite Acceptance without e-KYC (`POST /auth/signup`)
- **Purpose**: Fast-path registration for pre-vetted administrator accounts or testing.
- **Request Body**:
  ```json
  {
    "invite_token": "raw_invite_token_string",
    "name": "Prof. S. Mukherjee",
    "password": "FacultyPassword789!"
  }
  ```
- **Responses**:
  - `200 OK`: Account initialized in `active` state; returns `next: "liveness"`.

---

### 2.4. Central Credentials Sign-In (`POST /auth/login`)
- **Purpose**: Verifies email and password; initiates liveness challenge if no active session exists.
- **Authentication**: Public.
- **Request Body**:
  ```json
  {
    "email": "rahul@ju.edu",
    "password": "StrongPassword123!"
  }
  ```
- **Responses**:
  - `200 OK` (Needs Liveness Check):
    ```json
    {
      "status": "ok",
      "next": "liveness",
      "user_id": "c7a8b9d0-1234-5678-90ab-cdef12345678",
      "email": "rahul@ju.edu"
    }
    ```
  - `200 OK` (Already Has Active Session):
    ```json
    {
      "status": "ok",
      "next": "authenticated",
      "user": {
        "id": "c7a8b9d0-1234-5678-90ab-cdef12345678",
        "email": "rahul@ju.edu",
        "name": "Rahul Sharma",
        "role": "member"
      }
    }
    ```
  - `401 Unauthorized`: Password mismatch (`invalid_credentials`).
  - `403 Forbidden`: Account is `disabled` or still `pending_approval`.
- **Security Alert Notification**: Upon successful credential verification, an asynchronous email alert (`send_login_alert_email`) is dispatched to the user's registered inbox with client IP, browser User-Agent, and Indian Standard Time (IST) timestamp.

---

### 2.5. Central Logout (`POST /auth/logout`)
- **Purpose**: Terminates the user's active Single Sign-On session cookie.
- **Authentication**: Cookie (`sso_session`).
- **Response**: `200 OK` with `Set-Cookie: sso_session=; Max-Age=0`. Account remains active in database.

---

### 2.6. Get Current User Identity (`GET /me`)
- **Purpose**: Returns profile details of the currently authenticated browser session.
- **Authentication**: Cookie (`sso_session`).
- **Response**:
  ```json
  {
    "id": "c7a8b9d0-1234-5678-90ab-cdef12345678",
    "email": "rahul@ju.edu",
    "name": "Rahul Sharma",
    "role": "member",
    "status": "active"
  }
  ```

---

## 🔑 3. Password Recovery & SMTP Reset Endpoints

### 3.1. Initiate Password Reset (`POST /auth/forgot-password`)
- **Purpose**: Requests a single-use 15-minute reset token dispatched via institutional SMTP email.
- **Request Body**: `{"email": "rahul@ju.edu"}`
- **Response**: `200 OK` (Returns uniform generic success to prevent email enumeration attacks).

---

### 3.2. Validate Reset Token (`POST /auth/verify-reset-token`)
- **Purpose**: Pre-checks that a reset token from an email link is valid and unspent before presenting the new password form.
- **Request Body**: `{"token": "raw_reset_token_from_email"}`
- **Response**: `200 OK` with masked email: `{"valid": true, "email": "r***l@ju.edu", "name": "Rahul Sharma"}`.

---

### 3.3. Complete Password Reset (`POST /auth/reset-password`)
- **Purpose**: Sets a new password, hashes it with Argon2, invalidates active sessions, and marks the token used.
- **Request Body**:
  ```json
  {
    "token": "raw_reset_token_from_email",
    "password": "BrandNewSecurePassword2026!"
  }
  ```
- **Response**: `200 OK` with `{"status": "ok", "message": "Password updated successfully."}`.
- **Security Actions**:
  1. Updates password hash with memory-hard Argon2id.
  2. Destroys all active SSO sessions across all devices (`sso_sessions.revoked_at = NOW()`).
  3. Dispatches immediate **Password Changed Security Alert Email** (`send_password_changed_email`) to user's registered inbox with client IP, device User-Agent, and Indian Standard Time (IST) timestamp.

---

## 👁️ 4. Liveness & Biometric Verification Endpoints

### 4.1. Request Liveness Challenge (`POST /liveness/challenge`)
- **Purpose**: Generates an unpredictable physical movement challenge and a single-use verification code valid for 30 seconds.
- **Authentication**: Public or Cookie.
- **Request Body**: `{"user_id": "c7a8b9d0-1234-5678-90ab-cdef12345678"}`
- **Responses**:
  - `200 OK`:
    ```json
    {
      "challenge_id": "9f8e7d6c-5432-10fe-dcba-9876543210ab",
      "type": "turn_left",
      "code": "849201",
      "expires_in": 30
    }
    ```
  - `429 Too Many Requests`: More than 5 requests in 10 minutes.

---

### 4.2. Submit Liveness & Biometric Result (`POST /liveness/result`)
- **Purpose**: Evaluates the completed physical challenge and executes 1:1 Cosine Similarity matching against the enrolled face embedding.
- **Request Body**:
  ```json
  {
    "challenge_id": "9f8e7d6c-5432-10fe-dcba-9876543210ab",
    "code": "849201",
    "passed": true,
    "live_frame": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  }
  ```
- **Responses**:
  - `200 OK`: Liveness passed and face similarity $\ge 0.40$ (evaluated against approved user embedding or any authorized `admin_faces` profiles). Returns `Set-Cookie: sso_session=<id>; HttpOnly; SameSite=Lax`.
  - `400 Bad Request`: Code expired (older than 30 seconds) or already used.
  - `401 Unauthorized`: Face similarity $< 0.40$ (`face_mismatch`). If Admin Face Lock is enforced, failure to match an authorized administrator profile blocks login and emits `admin_face_mismatch` audit event.

---

## 🌐 5. OAuth 2.0 Single Sign-On (SSO) Endpoints

### 5.1. OAuth Authorize Gateway (`GET /authorize`)
- **Purpose**: Initiates single sign-on flow for connected campus clubs.
- **Query Parameters**:
  - `client_id`: e.g. `"app-a"`
  - `redirect_uri`: e.g. `"http://localhost:5174/callback"`
  - `state`: Cryptographic anti-CSRF state token generated by the club app.
- **Responses**:
  - `302 Found` (If active session exists): Redirects directly back to `redirect_uri?code=RAW_CODE&state=xyz`.
  - `302 Found` (If no session exists): Redirects to `http://localhost:5173/login?client_id=app-a&redirect_uri=...`.

---

### 5.2. Exchange Authorization Code for Tokens (`POST /token`)
- **Purpose**: Server-to-server token exchange endpoint called by connected applications.
- **Request Body**:
  ```json
  {
    "grant_type": "authorization_code",
    "code": "24_char_raw_auth_code",
    "client_id": "app-a",
    "client_secret": "app-a-secret-key"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "token_type": "bearer",
      "expires_in": 600,
      "refresh_token": "32_byte_raw_refresh_token_string"
    }
    ```
  - `400 Bad Request`: Code invalid, expired (over 60s), or already redeemed.
  - `401 Unauthorized`: Client ID or secret mismatch.
  - `403 Forbidden`: User account is no longer `active`.

---

### 5.3. Refresh Access Token (`POST /token/refresh`)
- **Purpose**: Obtains a new 10-minute JWT without interrupting the student's workflow.
- **Request Body**:
  ```json
  {
    "refresh_token": "32_byte_raw_refresh_token_string",
    "client_id": "app-a",
    "client_secret": "app-a-secret-key"
  }
  ```
- **Responses**:
  - `200 OK`: New `access_token` issued for 10 minutes.
  - `403 Forbidden`: Member account was disabled or marked as left.

---

### 5.4. Query User Identity (`GET /userinfo`)
- **Purpose**: Returns profile data to club applications presenting a Bearer access token.
- **Headers**: `Authorization: Bearer <jwt_access_token>`
- **Response**:
  ```json
  {
    "id": "c7a8b9d0-1234-5678-90ab-cdef12345678",
    "name": "Rahul Sharma",
    "email": "rahul@ju.edu",
    "role": "member"
  }
  ```

---

## 🛠️ 6. Administrator Management & Verification Endpoints

*All endpoints in this section require an active session belonging to an administrator (`role = "admin"`).*

### 6.1. List Pending e-KYC Applications (`GET /admin/applications`)
- **Purpose**: Retrieves all student registrations awaiting administrative document review.
- **Response**: Array of pending user records with metadata, creation dates, and file preview endpoints.

---

### 6.2. Approve e-KYC Application (`POST /admin/applications/{user_id}/approve`)
- **Purpose**: Transitions status from `pending_approval` to `active`, activating biometric facial login.
- **Response**: `200 OK` with `{"status": "ok", "message": "Application approved."}`.

---

### 6.3. Reject e-KYC Application (`POST /admin/applications/{user_id}/reject`)
- **Purpose**: Sets status to `disabled` with reason `'application_rejected'`.
- **Response**: `200 OK`.

---

### 6.4. Serve e-KYC Documents (`GET /admin/files/face/{user_id}` & `GET /admin/files/document/{user_id}`)
- **Purpose**: Securely serves the applicant's live enrollment portrait or student ID card image for visual inspection in the Admin Console.

---

### 6.5. Instant Access Revocation ("Mark as Left") (`POST /admin/users/{user_id}/mark-left`)
- **Purpose**: Immediately disables the departing member and revokes all active SSO sessions and refresh tokens in under 0.2 seconds.
- **Response**:
  ```json
  {
    "status": "ok",
    "message": "User rahul@ju.edu marked as left. All active sessions and tokens revoked."
  }
  ```

---

### 6.6. Create Member Invitation (`POST /admin/invites`)
- **Request Body**: `{"email": "student@ju.edu", "role": "member", "term_end": "2027-06-30"}`
- **Response**: `200 OK` with shareable link: `http://localhost:5173/signup?token=...`.
- **Automated Email Dispatch**: Asynchronously delivers an invitation email to `student@ju.edu` via SMTP containing the direct registration link with pre-authorized token.

---

### 6.7. Trigger Janitor Cleanup Job (`POST /admin/cleanup/run`)
- **Purpose**: Manually triggers the automated account lifecycle janitor for live demonstration purposes.
- **Response**:
  ```json
  {
    "status": "ok",
    "processed_at": "2026-11-20T12:00:00Z",
    "total_disabled": 1,
    "disabled_users": [{"id": "...", "email": "alumni@ju.edu", "reason": "term_end"}]
  }
  ```

---

### 6.8. Inspect Security Audit Log (`GET /admin/audit?limit=50`)
- **Purpose**: Retrieves newest-first tamper-resistant audit entries for forensic review.

---

### 6.9. Administrator Biometric Face Lock & Multi-Face Management Endpoints

#### 6.9.1. List Admin Face Profiles (`GET /admin/face-profiles`)
- **Headers**: Admin session cookie required (`require_admin_user`).
- **Response**:
  ```json
  {
    "profiles": [
      {
        "id": "profile-uuid-1",
        "name": "Shaan (Primary Admin)",
        "photo_url": "/api/admin/face-profiles/profile-uuid-1/photo",
        "created_at": "2026-11-21 07:15:00 IST"
      }
    ],
    "require_face_match": true,
    "has_profiles": true
  }
  ```

#### 6.9.2. Enroll Authorized Admin Face Profile (`POST /admin/face-profiles`)
- **Headers**: Admin session cookie required.
- **Request Body**:
  ```json
  {
    "name": "Arka (Co-Admin)",
    "face_photo": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  }
  ```
- **Execution**: Extracts 128D embedding using YuNet + SFace, saves portrait to `uploads/faces/`, and appends new profile object into `admin.admin_faces` JSON array in database.
- **Response**: `200 OK` with `{"status": "ok", "message": "Admin face profile added successfully.", "profile": {...}}`.

#### 6.9.3. Delete Admin Face Profile (`DELETE /admin/face-profiles/{profile_id}`)
- **Headers**: Admin session cookie required.
- **Execution**: Removes specified profile from `admin.admin_faces` JSON array and purges associated image from disk.
- **Response**: `200 OK` with `{"status": "ok", "message": "Admin face profile removed."}`.

#### 6.9.4. Toggle Admin Face Restriction (`POST /admin/face-profiles/toggle-restriction`)
- **Headers**: Admin session cookie required.
- **Execution**: Toggles `require_face_match` between `true` and `false`. When enabled, the administrator **must** match one of the enrolled `admin_faces` profiles during liveness verification ($\text{Cosine Sim} \ge 0.40$).
- **Response**: `200 OK` with `{"status": "ok", "require_face_match": true, "message": "Biometric face lock enforced for admin logins."}`.

#### 6.9.5. Serve Admin Face Profile Photo (`GET /admin/face-profiles/{profile_id}/photo`)
- **Headers**: Admin session cookie required.
- **Response**: Binary JPEG/PNG image stream of the registered administrator portrait.

---

## 7. 48-Hour Accidental Revocation & Expiration Renewal Endpoints

### 7.1. Submit Renewal Application (`POST /auth/renew`)
- **Purpose**: Allows members who were accidentally marked as left or expired to submit an appeal to restore their access within the 48-hour recovery window.
- **Request Body**:
  ```json
  {
    "email": "rahul@ju.edu",
    "reason": "Admin marked me as left accidentally during lab roll-call."
  }
  ```
- **Responses**:
  - `200 OK`: `{"status": "ok", "message": "Renewal application submitted successfully!...", "request_id": "..."}`
  - `400 Bad Request`: Account not disabled or 48-hour recovery window has expired (`window_expired`).
  - `404 Not Found`: No account exists with this email address.

---

### 7.2. List Renewal Requests (`GET /admin/renewals`)
- **Headers**: Admin session cookie required (`require_admin_user`).
- **Response**: List of renewal requests with dynamic 48-hour purge countdown timer:
  ```json
  [
    {
      "id": "req-uuid",
      "user_id": "user-uuid",
      "email": "rahul@ju.edu",
      "name": "Rahul Sharma",
      "reason": "Accidental mark-left",
      "status": "pending",
      "disabled_reason": "left",
      "hours_left": 41.5
    }
  ]
  ```

---

### 7.3. Approve Access Renewal (`POST /admin/renewals/{request_id}/approve`)
- **Headers**: Admin session cookie required.
- **Request Body** (Optional): `{"notes": "Verified with student executive."}`
- **Effect**: Reactivates member account (`status = 'active'`), cancels 48-hour purge countdown, dispatches confirmation email to student, and logs `renewal_approved`.

---

### 7.4. Decline Access Renewal (`POST /admin/renewals/{request_id}/decline`)
- **Headers**: Admin session cookie required.
- **Request Body** (Optional): `{"notes": "Term completed; ineligible for reactivation."}`
- **Effect**: Marks request as `declined`, dispatches decline notice email to student, and logs `renewal_declined`. Member data remains scheduled for permanent purge after 48 hours.
