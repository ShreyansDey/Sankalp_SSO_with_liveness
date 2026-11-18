"""
================================================================================
SANKALP SSO — MULTI-CLUB LOCAL DEMO SERVER
================================================================================
In plain words (Layman):
  This Python script starts 5 lightweight web servers on ports 5174 through 5178,
  representing 5 independent university campus clubs:
    1. Photography Club (Port 5174)
    2. Robotics Lab (Port 5175)
    3. Coding & AI Club (Port 5176)
    4. Chess & Mind Sports (Port 5177)
    5. Athletics & Sports Club (Port 5178)

  Instead of starting 5 separate terminals, this single script runs all of them
  cleanly and synchronously, printing a clear, neat status list in numerical order.

Technical Architecture:
  - Base: Python's standard library `http.server` & `socketserver`
  - Concurrency: `threading.Thread(daemon=True)` for non-blocking serving
  - Routing: Re-routes both `/` and `/callback` paths to `index.html` to support
    OAuth 2.0 authorization code callbacks cleanly without 404s.
================================================================================
"""

import http.server
import socketserver
import threading
import sys
from pathlib import Path

base_dir = Path(__file__).resolve().parent

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    """
    Custom HTTP request handler with CORS support and OAuth callback redirection.
    """
    def end_headers(self):
        # Allow cross-origin requests from front-end and API
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        # Handle CORS preflight checks smoothly
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Single-Page Application (SPA) routing:
        # If the user lands on "/" or the OAuth redirect "/callback?code=...",
        # serve index.html directly so client-side JavaScript handles the token exchange.
        if self.path == "/" or self.path.startswith("/callback"):
            self.path = "/index.html"
        return super().do_GET()

def start_club(port: int, folder: Path, club_name: str):
    """
    Synchronously binds the port and starts the background listener thread.
    This guarantees clean, sequential terminal output without overlapping text.
    """
    class Handler(CustomHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(folder), **kwargs)

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("", port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd

if __name__ == "__main__":
    print("=" * 65)
    print("  🏛️ Sankalp SSO — Launching 5 University Campus Clubs")
    print("=" * 65)

    clubs = [
        {"port": 5174, "dir": base_dir / "app-a", "name": "App A — Photography Club"},
        {"port": 5175, "dir": base_dir / "app-b", "name": "App B — Robotics Lab"},
        {"port": 5176, "dir": base_dir / "app-c", "name": "App C — Coding & AI Club"},
        {"port": 5177, "dir": base_dir / "app-d", "name": "App D — Chess & Mind Sports"},
        {"port": 5178, "dir": base_dir / "app-e", "name": "App E — Athletics & Sports"}
    ]

    servers = []
    for idx, c in enumerate(clubs, 1):
        try:
            httpd = start_club(c["port"], c["dir"], c["name"])
            servers.append(httpd)
            print(f"  {idx}. ✅ {c['name']:<30} : http://localhost:{c['port']}")
        except Exception as e:
            print(f"  {idx}. ⚠️ Could not start {c['name']} on port {c['port']}: {e}")

    print("=" * 65)
    print("  🎉 All 5 Connected Campus Clubs are live and listening!")
    print("  Press Ctrl+C to stop all servers.")
    print("=" * 65)

    try:
        # Keep main thread alive
        threading.Event().wait()
    except KeyboardInterrupt:
        print("\nStopping all demo club servers gracefully...")
        for s in servers:
            s.shutdown()
