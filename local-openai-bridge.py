#!/usr/bin/env python3
"""Local OpenAI-compatible bridge for browsers.

Listens on :8090 and transparently forwards /v1/* to llama-server on :8080.
Adds CORS + Local Network Access response headers so a PWA served from HTTPS
can talk to the local service when the browser grants local-network access.
"""

from __future__ import annotations

from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import os
import sys

LISTEN_HOST = os.environ.get("LOCAL_BRIDGE_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("LOCAL_BRIDGE_PORT", "8090"))
UPSTREAM_HOST = os.environ.get("LLAMA_HOST", "127.0.0.1")
UPSTREAM_PORT = int(os.environ.get("LLAMA_PORT", "8080"))

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def cors_headers(handler: BaseHTTPRequestHandler) -> None:
    origin = handler.headers.get("Origin", "*")
    handler.send_header("Access-Control-Allow-Origin", origin)
    handler.send_header("Vary", "Origin")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
    handler.send_header(
        "Access-Control-Allow-Headers",
        handler.headers.get(
            "Access-Control-Request-Headers",
            "Authorization, Content-Type, Accept, X-Requested-With",
        ),
    )
    # Required for Chromium's private/local-network request flow.
    handler.send_header("Access-Control-Allow-Private-Network", "true")
    handler.send_header("Cache-Control", "no-store")


class BridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stdout.write("[bridge] " + (fmt % args) + "\n")
        sys.stdout.flush()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        cors_headers(self)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _forward(self, method: str) -> None:
        parsed = urlsplit(self.path)
        path = parsed.path
        if not path.startswith("/v1/") and path != "/v1":
            self.send_response(404)
            cors_headers(self)
            body = b"Local bridge only proxies /v1/*"
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        upstream_path = path + (("?" + parsed.query) if parsed.query else "")
        content_length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(content_length) if content_length else None

        headers = {}
        for key in ("Authorization", "Content-Type", "Accept", "User-Agent"):
            value = self.headers.get(key)
            if value:
                headers[key] = value
        if body is not None:
            headers["Content-Length"] = str(len(body))

        connection = HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=120)
        try:
            connection.request(method, upstream_path, body=body, headers=headers)
            response = connection.getresponse()

            self.send_response(response.status, response.reason)
            cors_headers(self)

            response_headers = {}
            for key, value in response.getheaders():
                if key.lower() in HOP_BY_HOP:
                    continue
                if key.lower() in {"access-control-allow-origin", "access-control-allow-private-network"}:
                    continue
                response_headers[key] = value

            # Preserve content type, length and streaming hints from llama-server.
            for key, value in response_headers.items():
                self.send_header(key, value)
            self.end_headers()

            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception as exc:
            self.send_response(502)
            cors_headers(self)
            payload = f"Local bridge upstream error: {exc}".encode("utf-8", "replace")
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        finally:
            connection.close()

    def do_GET(self) -> None:
        self._forward("GET")

    def do_POST(self) -> None:
        self._forward("POST")

    def do_PUT(self) -> None:
        self._forward("PUT")

    def do_PATCH(self) -> None:
        self._forward("PATCH")

    def do_DELETE(self) -> None:
        self._forward("DELETE")


if __name__ == "__main__":
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), BridgeHandler)
    print("=" * 64)
    print("Local OpenAI-Compatible Bridge")
    print(f"Listening: http://127.0.0.1:{LISTEN_PORT}")
    print(f"LAN:       http://<LAPTOP-IP>:{LISTEN_PORT}")
    print(f"Upstream:  http://{UPSTREAM_HOST}:{UPSTREAM_PORT}")
    print("Proxy:     /v1/*")
    print("=" * 64)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping bridge...")
    finally:
        server.server_close()
