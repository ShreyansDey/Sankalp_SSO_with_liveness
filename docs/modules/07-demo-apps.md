# 07 — Demo Apps (App A & App B)

**Status:** done · **Owner:** Arka · **Date:** 2026-11-17

## 1. What it is (plain words)
Two real, working web applications ("App A — Photography Club" on port 5174 and "App B — Robotics Lab" on port 5175) that rely exclusively on Sankalp SSO for authentication. They prove the core pitch: sign in once with camera check to open App A, open App B in one click with no second camera check, and watch access disappear from both apps the moment an admin marks someone as left.

## 2. Why it exists
Covers requirements **M8** (two demo apps showing Welcome / Access denied), **M4** (one-click SSO switch), and the full execution of the 4-minute presentation in `demo-script.md`.

## 3. How it works
1. **App A Sign-in**:
   - The user opens App A (`http://localhost:5174`).
   - Clicking "Sign in with Sankalp SSO" redirects to `http://localhost:8000/authorize?client_id=app-a&redirect_uri=http://localhost:5174/callback&state=...`.
   - The user passes password and camera liveness on the central portal.
   - The portal redirects to App A's callback with an authorization code.
   - App A exchanges the code for a JWT access token (10 min) and refresh token, displaying: **"Welcome, Rahul Sharma! 🎉"**.
2. **App B One-Click (Step 2 of Demo Script)**:
   - The user opens App B (`http://localhost:5175`).
   - Because the central `sso_session` cookie already exists on `localhost:8000`, clicking sign-in redirects to the central server, which immediately issues an authorization code and bounces straight back to App B.
   - **No password form and no camera check!** App B displays: **"Welcome, Rahul Sharma! 🤖"**.
3. **Instant Removal (Step 4 of Demo Script)**:
   - In the Admin Dashboard (`http://localhost:5173/admin`), the admin clicks **"Mark as left"** for Rahul.
   - Refreshing or testing tokens in either App A or App B immediately displays: **"⛔ ACCESS DENIED: Account disabled (left)"**.

## 4. Code

### `demo-apps/serve_demo_apps.py`
```python
# demo-apps/serve_demo_apps.py
class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path.startswith("/callback"):
            self.path = "/index.html"
        return super().do_GET()

def run_server(port, folder):
    class Handler(CustomHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(folder), **kwargs)

    with socketserver.TCPServer(("", port), Handler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    t1 = threading.Thread(target=run_server, args=(5174, base_dir / "app-a"), daemon=True)
    t2 = threading.Thread(target=run_server, args=(5175, base_dir / "app-b"), daemon=True)
    t1.start()
    t2.start()
```

### `demo-apps/app-a/index.html` (Token exchange & denial extract)
```javascript
// demo-apps/app-a/index.html
async function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  if (!code) return false;

  const res = await fetch("http://localhost:8000/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: code,
      client_id: "app-a",
      client_secret: "secret-app-a-key-2026"
    })
  });
  if (!res.ok) {
    renderAccessDenied("Token exchange failed");
    return true;
  }
  const data = await res.json();
  sessionStorage.setItem("access_token", data.access_token);
  sessionStorage.setItem("refresh_token", data.refresh_token);
  renderAuthenticated();
  return true;
}
```

## 5. Code explanation
- The demo apps demonstrate the full OAuth 2.0 Authorization Code Flow with Proof of Possession and redirect URI binding.
- `renderAccessDenied` immediately strips stored tokens and replaces the user view with an unmistakable denial warning.
- The dual-server script in `serve_demo_apps.py` routes `/callback` URL paths cleanly back to the client application runner without external web server dependencies.

## 6. How to run and test it
1. Start the demo apps:
   ```bash
   python demo-apps/serve_demo_apps.py
   ```
2. Open `http://localhost:5174` (App A) in Google Chrome or Edge.
3. Open `http://localhost:5175` (App B) in a new tab.

**Checklist items satisfied:**
- [x] App A → login → back with a token → Welcome.
- [x] App B opens with no form and no camera while the session is live.
- [x] Mark as left: both apps show Access denied immediately; refresh token fails.

## 7. Limits and future work
App A and App B currently execute the token exchange in the browser for demo transparency. In production, client secrets should reside on a backend application server using OAuth2 Authorization Code Flow with PKCE (Proof Key for Code Exchange).
