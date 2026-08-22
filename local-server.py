import http.server
import urllib.request
import urllib.error
import os

HOST = "127.0.0.1"
PORT = 3000
LLAMA = "http://127.0.0.1:8080"
ROOT = os.path.dirname(os.path.abspath(__file__))

MIME = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2"
}

PROVIDER_SCRIPTS = """
<script src="provider-ui-patch.js"></script>
<script src="provider-bridge.js"></script>
<script src="provider-runtime-fixes.js"></script>
<script src="provider-local-detect.js"></script>
<script src="provider-settings-ui.js"></script>
"""

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def proxy(self):
        target = LLAMA + self.path
        body = None
        if "Content-Length" in self.headers:
            body = self.rfile.read(int(self.headers["Content-Length"]))
        headers = {k: v for k, v in self.headers.items()
                   if k.lower() not in ("host", "content-length", "connection")}
        try:
            req = urllib.request.Request(target, data=body, headers=headers, method=self.command)
            with urllib.request.urlopen(req, timeout=600) as r:
                data = r.read()
                self.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() not in ("connection", "transfer-encoding", "content-length"):
                        self.send_header(k, v)
                self.cors()
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            data = ('{"error":{"message":"' + str(e).replace('"', '\\"') + '"}}').encode()
            self.send_response(502)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def static(self):
        path = self.path.split("?", 1)[0]
        if path == "/": path = "/index.html"
        rel = os.path.normpath(path.lstrip("/"))
        full = os.path.abspath(os.path.join(ROOT, rel))
        if not full.startswith(ROOT + os.sep) or not os.path.isfile(full):
            self.send_error(404)
            return
        data = open(full, "rb").read()
        if full.lower().endswith("index.html"):
            html = data.decode("utf-8", errors="replace")
            if "provider-settings-ui.js" not in html:
                html = html.replace("</body>", PROVIDER_SCRIPTS + "\n</body>")
            data = html.encode("utf-8")
        self.send_response(200)
        self.cors()
        self.send_header("Content-Type", MIME.get(os.path.splitext(full)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def route(self):
        if self.path.startswith("/v1/") or self.path == "/health": self.proxy()
        else: self.static()

    do_GET = route
    do_POST = route
    do_PUT = route
    do_DELETE = route

    def log_message(self, fmt, *args):
        print("[LOCAL] " + fmt % args)

print(f"AI Chat local server: http://{HOST}:{PORT}")
print(f"OpenAI proxy: http://{HOST}:{PORT}/v1 -> {LLAMA}/v1")
http.server.ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
