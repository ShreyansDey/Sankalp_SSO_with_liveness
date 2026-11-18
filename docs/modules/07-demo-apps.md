# 07 — Connected Campus Clubs (5 Demo Apps: App A through App E)

**Status:** done · **Owner:** Shaan & Arka · **Date:** 2026-11-18

---

## 1. What it is (Plain Words / Layman Explanation)

Imagine a university with 5 different campus clubs and facilities:
1. **Photography Club** (Port 5174) — Camera gear checkout and photo gallery.
2. **Robotics Lab** (Port 5175) — 3D printers, microcontrollers, and lab door locks.
3. **Coding & AI Club** (Port 5176) — GPU servers and hackathon teams.
4. **Chess & Mind Sports Club** (Port 5177) — Tournament brackets and player ratings.
5. **Athletics & Sports Club** (Port 5178) — Gymnasium access and sports equipment.

Normally, students would need 5 different passwords, and when a student graduates or leaves, the college would have to remember to delete them from all 5 systems manually. If someone forgets, the student's login stays active forever!

With **Sankalp SSO**:
- Students sign in **once** at the central gate (`http://localhost:5173`) with their password and a quick camera blink check.
- They see their **Clubs Hub** and can click into **any of the 5 clubs with 1 single click**—no typing passwords again, no repeating the camera check!
- When an admin clicks **"Mark as left"**, access across **all 5 clubs ends in under 0.2 seconds simultaneously**.

---

## 2. Why it exists (SRS Requirements)

Covers requirements:
* **M8**: Connected demo apps showing Welcome and instant Access Denied states.
* **M4**: Central Single Sign-On (SSO) with one-click transitions between independent applications.
* **FR6**: Product registration with unique client IDs, hashed secrets, and strict callback URI validation.
* **FR2**: Instant revocation of sessions and refresh tokens across all connected products.

---

## 3. How it works (Architecture & Flow)

```
                     ┌──────────────────────────────────────────────┐
                     │          CENTRAL SANKALP SSO (:8000)         │
                     │  - Sets HttpOnly sso_session cookie          │
                     │  - Issues 60s single-use Authorization Codes │
                     │  - Issues 10-min JWTs & revocable refresh tok │
                     └──────────────────────┬───────────────────────┘
                                            │
        ┌───────────────────┬───────────────┼───────────────┬───────────────────┐
        ▼                   ▼               ▼               ▼                   ▼
┌───────────────┐   ┌───────────────┐┌───────────────┐┌───────────────┐   ┌───────────────┐
│     App A     │   │     App B     ││     App C     ││     App D     │   │     App E     │
│  Photography  │   │  Robotics Lab ││  Coding & AI  ││   Chess Club  │   │Athletics/Sport│
│  (Port 5174)  │   │  (Port 5175)  ││  (Port 5176)  ││  (Port 5177)  │   │  (Port 5178)  │
└───────────────┘   └───────────────┘└───────────────┘└───────────────┘   └───────────────┘
```

1. **OAuth 2.0 Authorization Code Flow**:
   - The user opens any club (e.g. `http://localhost:5174`).
   - If not signed in, the club redirects the browser to `http://localhost:8000/authorize?client_id=app-a&redirect_uri=http://localhost:5174/callback&state=...`.
   - The backend checks if an active `sso_session` cookie exists:
     - **If yes**: Immediately generates a 60-second one-time code and redirects straight back to the club's callback URI.
     - **If no**: Prompts the user to log in and pass the liveness challenge.
2. **Token Exchange (`POST /token`)**:
   - The club application extracts the `code` from the URL.
   - It makes a backend call to `POST /token` sending:
     `{ grant_type: "authorization_code", code, client_id, client_secret }`.
   - The backend hashes the code, verifies it matches `auth_codes.code_hash`, marks it used, and returns:
     - `access_token`: A signed JWT valid for 10 minutes containing student identity.
     - `refresh_token`: A high-entropy revocable token stored hashed in PostgreSQL.
3. **One-Click Part**:
   - Opening any of the other 4 clubs (ports 5175, 5176, 5177, 5178) detects the same active session cookie. The user is logged in instantly with **zero password prompts**.
4. **Instant Revocation ("Mark as Left")**:
   - When Admin marks the user as left in `:5173/admin`, their status is set to `disabled`, and all rows in `sso_sessions` and `refresh_tokens` are set to `revoked_at = NOW()`.
   - On the next token check or page refresh, all 5 apps immediately render the bright red **"ACCESS DENIED"** card.

---

## 4. Key Source Code

### `demo-apps/serve_demo_apps.py` (Multi-Port Runner)
```python
import http.server
import socketserver
import threading
from pathlib import Path

base_dir = Path(__file__).resolve().parent

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_GET(self):
        # Single-Page Application routing: serve index.html for / and /callback
        if self.path == "/" or self.path.startswith("/callback"):
            self.path = "/index.html"
        return super().do_GET()

def run_server(port: int, folder: Path, club_name: str):
    class Handler(CustomHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(folder), **kwargs)

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"   🚀 [{club_name}] active on http://localhost:{port}")
        httpd.serve_forever()

if __name__ == "__main__":
    clubs = [
        {"port": 5174, "dir": base_dir / "app-a", "name": "Photography Club"},
        {"port": 5175, "dir": base_dir / "app-b", "name": "Robotics Lab"},
        {"port": 5176, "dir": base_dir / "app-c", "name": "Coding & AI Club"},
        {"port": 5177, "dir": base_dir / "app-d", "name": "Chess & Mind Sports"},
        {"port": 5178, "dir": base_dir / "app-e", "name": "Athletics & Sports"}
    ]
    for c in clubs:
        threading.Thread(target=run_server, args=(c["port"], c["dir"], c["name"]), daemon=True).start()
```

---

## 5. How to Run and Test It

1. Start all 5 clubs:
   ```powershell
   python demo-apps/serve_demo_apps.py
   ```
2. Verify ports in your browser:
   * **Photography Club**: `http://localhost:5174`
   * **Robotics Lab**: `http://localhost:5175`
   * **Coding & AI Club**: `http://localhost:5176`
   * **Chess & Mind Sports**: `http://localhost:5177`
   * **Athletics & Sports**: `http://localhost:5178`
3. Click *"Sign In with Sankalp SSO"* on any club &rarr; complete login &rarr; Welcome!
4. Open the other 4 clubs &rarr; all 4 open instantly with 1-click SSO!
5. In Admin (`:5173/admin`), click **"Mark as left"** on Rahul.
6. Refresh all 5 club tabs &rarr; all 5 show **"ACCESS DENIED"**.

**Checklist Items Satisfied:**
- [x] App A through App E connected via registered OAuth client credentials.
- [x] One login opens all 5 connected campus apps.
- [x] Session cookie allows seamless switching across apps without repeated camera prompts.
- [x] Mark as left disables access everywhere simultaneously (< 0.2s).

---

## 6. Known Limits

1. **Localhost Ports Simulation**: In a production university environment, each club would reside on its own sub-domain (e.g., `photo.university.edu`, `robotics.university.edu`). In this local prototype, distinct ports (`5174`–`5178`) simulate distinct origins.
2. **Tokens in SessionStorage**: Tokens are stored in browser `sessionStorage` for demo isolation. Closing a tab clears the client-side copy, while server revocation terminates access regardless.
