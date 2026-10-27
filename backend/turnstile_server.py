"""Small, dependency-free Turnstile service; exposed only through Nginx."""
import hashlib
import json
import logging
import os
import secrets
import threading
import time
from datetime import datetime, timezone
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import Request, urlopen

SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
COOKIE_NAME = "__Host-bio_turnstile"
SESSION_TTL = 600
ACTION = "bio_demo"
LOG = logging.getLogger("turnstile")


class VerificationUnavailable(Exception):
    pass


class TurnstileService:
    def __init__(self, secret, sitekey, hostnames):
        if not secret or not sitekey or not hostnames:
            raise ValueError("Turnstile keys and allowed hostnames are required")
        self.secret = secret
        self.sitekey = sitekey
        self.hostnames = set(hostnames)
        self.origins = {"https://" + name for name in hostnames}
        self.sessions = {}
        self.lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(4)

    def verify(self, token):
        if not isinstance(token, str) or not token.strip() or len(token) > 2048:
            return False
        if not self.slots.acquire(blocking=False):
            raise VerificationUnavailable()
        try:
            request = Request(SITEVERIFY, data=json.dumps({
                "secret": self.secret, "response": token,
            }).encode(), headers={"Content-Type": "application/json"}, method="POST")
            with urlopen(request, timeout=10) as response:
                result = json.loads(response.read(16384))
            if not isinstance(result, dict):
                raise VerificationUnavailable()
            return (result.get("success") is True
                    and result.get("hostname") in self.hostnames
                    and result.get("action") == ACTION)
        except (URLError, OSError, ValueError) as exc:
            # Never log credentials, tokens or Cloudflare response bodies.
            LOG.warning("Siteverify unavailable (%s)", type(exc).__name__)
            raise VerificationUnavailable() from exc
        finally:
            self.slots.release()

    def create_session(self):
        token = secrets.token_urlsafe(32)
        now = time.monotonic()
        with self.lock:
            self.sessions = {key: expiry for key, expiry in self.sessions.items() if expiry > now}
            if len(self.sessions) >= 10000:
                raise VerificationUnavailable()
            self.sessions[self.digest(token)] = now + SESSION_TTL
        return token

    @staticmethod
    def digest(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def has_session(self, cookie_header):
        cookie = SimpleCookie()
        try:
            cookie.load(cookie_header or "")
            token = cookie[COOKIE_NAME].value if COOKIE_NAME in cookie else ""
        except CookieError:
            return False
        if not token or len(token) > 128:
            return False
        with self.lock:
            return self.sessions.get(self.digest(token), 0) > time.monotonic()


def make_handler(service):
    class Handler(BaseHTTPRequestHandler):
        server_version = "BioTurnstile"

        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def respond(self, status, data, cookie=None):
            payload = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if cookie:
                self.send_header("Set-Cookie", cookie)
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            if self.path == "/turnstile-api/config":
                return self.respond(200, {"sitekey": service.sitekey, "action": ACTION})
            if self.path == "/turnstile-api/session":
                return self.respond(200, {"verified": service.has_session(self.headers.get("Cookie"))})
            if self.path == "/turnstile-api/health":
                return self.respond(200, {"ok": True})
            if self.path == "/turnstile-api/resource":
                if not service.has_session(self.headers.get("Cookie")):
                    return self.respond(403, {"error": "verification_required", "message": "请先完成人机验证"})
                return self.respond(200, {
                    "message": "你已通过服务端验证，成功读取受保护内容。",
                    "session_seconds": SESSION_TTL,
                    "time": datetime.now(timezone.utc).isoformat(),
                    "items": ["生物信息学服务介绍", "科研技术资料示例", "实验方案咨询示例"],
                })
            self.respond(404, {"error": "not_found"})

        def do_POST(self):
            if self.path != "/turnstile-api/verify":
                return self.respond(404, {"error": "not_found"})
            if self.headers.get("Origin") not in service.origins:
                return self.respond(403, {"error": "invalid_origin"})
            if self.headers.get_content_type() != "application/json":
                return self.respond(415, {"error": "json_required"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 4096:
                    return self.respond(400, {"error": "invalid_body"})
                body = json.loads(self.rfile.read(length))
                token = body.get("token") if isinstance(body, dict) else None
            except (ValueError, OSError):
                return self.respond(400, {"error": "invalid_body"})
            try:
                if not service.verify(token):
                    return self.respond(403, {"error": "verification_failed", "message": "验证未通过或已过期，请重试"})
                session = service.create_session()
            except VerificationUnavailable:
                return self.respond(503, {"error": "verification_unavailable", "message": "验证服务暂时不可用，请稍后重试"})
            self.respond(200, {"verified": True, "expires_in": SESSION_TTL},
                         f"{COOKIE_NAME}={session}; Path=/; Max-Age={SESSION_TTL}; Secure; HttpOnly; SameSite=Strict")

        def log_message(self, fmt, *args):
            # Only route and status; request headers and bodies stay private.
            LOG.info("%s", fmt % args)

    return Handler


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    service = TurnstileService(
        os.environ.get("TURNSTILE_SECRET_KEY"), os.environ.get("TURNSTILE_SITEKEY"),
        [name.strip() for name in os.environ.get("TURNSTILE_HOSTNAMES", "").split(",") if name.strip()],
    )
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", "8790"))), make_handler(service))
    server.daemon_threads = True
    server.serve_forever()
