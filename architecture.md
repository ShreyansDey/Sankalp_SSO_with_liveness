# architecture.md

## 1. Parts
```
 Browser ──► Product (App A / App B)
    │            │  1. no token? redirect to central login
    ▼            ▼
 Central Login (React page) ◄──► Auth Server (FastAPI) ◄──► PostgreSQL
    │                                   ▲
    │ MediaPipe (liveness, in browser)  │ daily Cleanup Job
    ▼                                   │
 pass/fail only ───────────────────────┘
                              Admin Dashboard (React) ──► Auth Server
```
- **Auth Server (FastAPI)**: signup, login, liveness verification, SSO session, tokens, admin actions, audit.
- **Central Login (React)**: login form, liveness screen, redirect handling.
- **Admin Dashboard (React)**: users, invites, mark as left, audit log.
- **Cleanup Job**: runs daily (and on demand for the demo) to disable expired or inactive accounts.
- **Demo apps**: tiny pages that redirect to central login and show Welcome or Access denied.

## 2. SSO flow (one-click part)
1. User opens App A. No token → redirect to `/authorize?client_id=A&redirect_uri=...&state=...` on the central login.
2. No SSO session → login form → if first time or no session, liveness check → SSO session cookie set at the central login.
3. Server redirects back to App A with a one-time `code`.
4. App A calls `POST /token` with the code and its secret → gets an access token (10 min) and a refresh token.
5. User opens App B → redirect to central login → session cookie exists → no form, no camera → back with a code instantly.
6. When access ends: SSO session and refresh tokens are revoked; the next token refresh or redirect fails → Access denied.

## 3. Liveness flow
1. Browser asks `POST /liveness/challenge` → server returns a random challenge (blink twice or turn head left/right) and a one-time code valid 30 seconds.
2. MediaPipe Face Mesh runs in the browser and detects the action.
3. Browser sends `POST /liveness/result` with the challenge id, the code and pass/fail.
4. Server checks the code is unused and not expired, stores pass/fail with a time, marks the code used.

## 4. Account lifecycle
`active` → `disabled` (mark as left, term end, inactivity) → `deleted` (30 days after disabled, admin approves).
Logout ends a session only. A disabled user can never log in until an admin re-enables the account.

## 5. Folder layout
```
/backend   app/ (main.py, models.py, routes/, services/, jobs/), tests/
/frontend  src/ (pages: Login, Liveness, Admin), vite config
/demo-apps app-a/, app-b/
/docs      modules/ (one md per module)
```

## 6. Decisions
- Central login holds the session (cookie); products only hold short tokens.
- Short access tokens + revocable refresh tokens make "access ends everywhere" real without waiting long.
- Liveness runs in the browser to keep face video private.
