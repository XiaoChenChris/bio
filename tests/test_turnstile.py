import io
import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import URLError

from backend.turnstile_server import (
    ACTION, COOKIE_NAME, TurnstileService, VerificationUnavailable, make_handler,
)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = TurnstileService("test-secret", "test-sitekey", ["biochris.top"])

    def cloudflare(self, result):
        return patch("backend.turnstile_server.urlopen", return_value=io.BytesIO(json.dumps(result).encode()))

    def test_success_requires_hostname_and_action(self):
        valid = {"success": True, "hostname": "biochris.top", "action": ACTION}
        with self.cloudflare(valid):
            self.assertTrue(self.service.verify("fresh-token"))
        for changed in ({"success": False}, {"hostname": "attacker.example"}, {"action": "other"}):
            with self.cloudflare({**valid, **changed}):
                self.assertFalse(self.service.verify("fresh-token"))

    def test_missing_and_oversized_tokens_never_call_cloudflare(self):
        with patch("backend.turnstile_server.urlopen") as remote:
            for token in (None, "", " ", "x" * 2049, 12, {}):
                self.assertFalse(self.service.verify(token))
            remote.assert_not_called()

    def test_spent_token_is_rejected(self):
        with self.cloudflare({"success": False, "error-codes": ["timeout-or-duplicate"]}):
            self.assertFalse(self.service.verify("spent-token"))

    def test_cloudflare_network_failure_fails_closed(self):
        with patch("backend.turnstile_server.urlopen", side_effect=URLError("offline")):
            with self.assertRaises(VerificationUnavailable):
                self.service.verify("fresh-token")

    def test_malformed_cloudflare_reply_fails_closed(self):
        with self.cloudflare([]):
            with self.assertRaises(VerificationUnavailable):
                self.service.verify("fresh-token")

    def test_session_is_random_expiring_and_cannot_be_forged(self):
        with patch("backend.turnstile_server.time.monotonic", return_value=100):
            token = self.service.create_session()
            self.assertTrue(self.service.has_session(f"{COOKIE_NAME}={token}"))
            self.assertFalse(self.service.has_session(f"{COOKIE_NAME}=made-up"))
        self.assertNotIn(token, self.service.sessions)
        with patch("backend.turnstile_server.time.monotonic", return_value=701):
            self.assertFalse(self.service.has_session(f"{COOKIE_NAME}={token}"))


class EndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = TurnstileService("test-secret", "test-sitekey", ["biochris.top"])
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cls.service))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, body=None, headers=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request(method, "/turnstile-api/" + path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), json.loads(response.read())
        connection.close()
        return result

    def verify(self, token="fresh-token", origin="https://biochris.top"):
        return self.request("POST", "verify", json.dumps({"token": token}),
                            {"Content-Type": "application/json", "Origin": origin})

    def test_direct_and_forged_access_are_denied(self):
        self.assertEqual(self.request("GET", "resource")[0], 403)
        self.assertEqual(self.request("GET", "resource", headers={"Cookie": f"{COOKIE_NAME}=forged"})[0], 403)

    def test_untrusted_origin_cannot_create_session(self):
        with patch.object(self.service, "verify") as verify:
            self.assertEqual(self.verify(origin="https://attacker.example")[0], 403)
            verify.assert_not_called()

    def test_missing_token_cannot_create_session(self):
        status, headers, _ = self.verify(token="")
        self.assertEqual(status, 403)
        self.assertNotIn("Set-Cookie", headers)

    def test_valid_verification_unlocks_resource_with_secure_cookie(self):
        with patch.object(self.service, "verify", return_value=True):
            status, headers, body = self.verify()
        self.assertEqual(status, 200)
        self.assertTrue(body["verified"])
        cookie = headers["Set-Cookie"]
        for attribute in ("Secure", "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=600"):
            self.assertIn(attribute, cookie)
        status, headers, body = self.request("GET", "resource", headers={"Cookie": cookie.split(";", 1)[0]})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertTrue(body["items"])

    def test_cloudflare_outage_does_not_issue_cookie(self):
        with patch.object(self.service, "verify", side_effect=VerificationUnavailable):
            status, headers, _ = self.verify()
        self.assertEqual(status, 503)
        self.assertNotIn("Set-Cookie", headers)


if __name__ == "__main__":
    unittest.main()
