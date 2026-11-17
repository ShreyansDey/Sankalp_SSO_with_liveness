import http.server
import socketserver
import threading
import sys
from pathlib import Path

base_dir = Path(__file__).resolve().parent

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for demo apps
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Serve index.html for root or callback routes
        if self.path == "/" or self.path.startswith("/callback"):
            self.path = "/index.html"
        return super().do_GET()

def run_server(port, folder):
    class Handler(CustomHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(folder), **kwargs)

    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"🚀 Demo App served on http://localhost:{port} (dir: {folder.name})")
        httpd.serve_forever()

if __name__ == "__main__":
    app_a_dir = base_dir / "app-a"
    app_b_dir = base_dir / "app-b"

    t1 = threading.Thread(target=run_server, args=(5174, app_a_dir), daemon=True)
    t2 = threading.Thread(target=run_server, args=(5175, app_b_dir), daemon=True)

    t1.start()
    t2.start()

    print("✅ App A running on http://localhost:5174")
    print("✅ App B running on http://localhost:5175")
    print("Press Ctrl+C to stop.")

    try:
        t1.join()
        t2.join()
    except KeyboardInterrupt:
        print("\nStopping demo app servers...")
