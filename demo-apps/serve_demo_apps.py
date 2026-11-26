"""
Multi-threaded Demo Applications HTTP Server for Sankalp SSO.
Serves App A (5174), App B (5175), App C (5176), App D (5177), App E (5178)
plus shared static client scripts concurrently without single-thread head-of-line blocking.
"""
import functools
import http.server
import socketserver
import threading
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

APPS = [
    ("App A (Campus Robotics)", 5174, BASE_DIR / "app-a"),
    ("App B (Science & Coding)", 5175, BASE_DIR / "app-b"),
    ("App C (Photography & Media)", 5176, BASE_DIR / "app-c"),
    ("App D (Cultural & Dramatics)", 5177, BASE_DIR / "app-d"),
    ("App E (Robotics & AI)", 5178, BASE_DIR / "app-e"),
]


class DemoHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith("/shared/"):
            rel = path[len("/shared/"):].lstrip("/")
            target = (BASE_DIR / "shared" / rel).resolve()
            if str(target).startswith(str((BASE_DIR / "shared").resolve())):
                return str(target)
        return super().translate_path(path)

    def log_message(self, format, *args):
        pass


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def serve_app(name: str, port: int, directory: Path):
    handler = functools.partial(DemoHandler, directory=str(directory))
    server = ThreadedHTTPServer(("0.0.0.0", port), handler)
    print(f"Serving {name} on http://localhost:{port}")
    server.serve_forever()


def main():
    threads = []
    for name, port, directory in APPS:
        t = threading.Thread(target=serve_app, args=(name, port, directory), daemon=True)
        t.start()
        threads.append(t)

    print("All 5 demo apps are running concurrently. Press Ctrl+C to stop.")
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        print("\nShutting down demo app servers cleanly.")


if __name__ == "__main__":
    main()
