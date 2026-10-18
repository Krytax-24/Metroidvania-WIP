#!/usr/bin/env python3
"""Tiny dev server for Ashen Ascent: correct MIME types, no caching, and a LAN address for phone testing.

    python serve.py            # http://localhost:8000
    python serve.py --port 9000
"""
import argparse
import http.server
import socket
import socketserver
from pathlib import Path


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".png": "image/png",
        ".html": "text/html; charset=utf-8",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="0.0.0.0", help="0.0.0.0 lets a phone on your Wi-Fi connect")
    args = ap.parse_args()
    root = Path(__file__).resolve().parent
    handler = lambda *a, **k: Handler(*a, directory=str(root), **k)  # noqa: E731
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((args.host, args.port), handler) as httpd:
        print(f"Ashen Ascent\n  This computer:  http://localhost:{args.port}/")
        if args.host == "0.0.0.0":
            print(f"  Phone on Wi-Fi: http://{lan_ip()}:{args.port}/")
        print("Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
