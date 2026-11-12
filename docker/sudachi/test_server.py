"""Tests for the Sudachi sidecar. SudachiPy is stubbed, so they need neither the package nor its dictionary.

Run from the repo root: python -m unittest discover -s docker/sudachi
"""
import http.client
import json
import sys
import threading
import time
import types
import unittest
from http.server import ThreadingHTTPServer


class Morpheme:
    def __init__(self, surface: str) -> None:
        self._surface = surface

    def surface(self) -> str:
        return self._surface

    def reading_form(self) -> str:
        return self._surface.upper()

    def dictionary_form(self) -> str:
        return self._surface.lower()

    def part_of_speech(self) -> tuple:
        return ("noun", "*")


class OneCallerTokenizer:
    """Like SudachiPy's: a second caller inside it at the same time is an error."""

    def __init__(self) -> None:
        self.inside = threading.Lock()
        self.seconds_inside = 0.0

    def tokenize(self, text: str, mode: object) -> list:
        if not self.inside.acquire(blocking=False):
            raise RuntimeError("Already borrowed")
        try:
            time.sleep(self.seconds_inside)
            return [Morpheme(part) for part in text.split()]
        finally:
            self.inside.release()


TOKENIZER = OneCallerTokenizer()
sudachipy = types.ModuleType("sudachipy")
sudachipy.dictionary = types.SimpleNamespace(Dictionary=lambda: types.SimpleNamespace(create=lambda: TOKENIZER))
sudachipy.tokenizer = types.SimpleNamespace(Tokenizer=types.SimpleNamespace(SplitMode=types.SimpleNamespace(C="C")))
sys.modules["sudachipy"] = sudachipy

import server  # noqa: E402


class SidecarTest(unittest.TestCase):
    def setUp(self) -> None:
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)

    def connect(self) -> http.client.HTTPConnection:
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_address[1], timeout=5)
        self.addCleanup(connection.close)
        return connection

    def ask(self, connection: http.client.HTTPConnection, method: str, path: str, body: bytes | None = None):
        connection.request(method, path, body)
        response = connection.getresponse()
        return response.status, json.loads(response.read()), response

    def test_tokenizes_a_text_into_surface_reading_lemma_and_part_of_speech(self) -> None:
        status, body, response = self.ask(self.connect(), "POST", "/tokenize", json.dumps({"text": "Neko Inu"}).encode())
        self.assertEqual(status, 200)
        self.assertEqual(
            body,
            {
                "tokens": [
                    {"surface": "Neko", "reading": "NEKO", "lemma": "neko", "pos": ["noun", "*"]},
                    {"surface": "Inu", "reading": "INU", "lemma": "inu", "pos": ["noun", "*"]},
                ]
            },
        )
        self.assertEqual(response.getheader("Content-Type"), "application/json; charset=utf-8")

    def test_answers_japanese_as_utf8_with_its_length_in_bytes(self) -> None:
        connection = self.connect()
        connection.request("POST", "/tokenize", json.dumps({"text": "猫"}).encode())
        response = connection.getresponse()
        raw = response.read()
        self.assertIn("猫".encode(), raw)
        self.assertEqual(response.getheader("Content-Length"), str(len(raw)))

    def test_keeps_one_connection_open_for_many_sentences(self) -> None:
        connection = self.connect()
        first = self.ask(connection, "POST", "/tokenize", b'{"text": "a"}')
        socket = connection.sock
        second = self.ask(connection, "POST", "/tokenize", b'{"text": "b"}')
        self.assertEqual([first[2].version, first[0], second[0]], [11, 200, 200])
        self.assertIsNotNone(socket)
        self.assertIs(connection.sock, socket)

    def test_lets_one_caller_into_the_tokenizer_at_a_time(self) -> None:
        TOKENIZER.seconds_inside = 0.2
        self.addCleanup(setattr, TOKENIZER, "seconds_inside", 0.0)
        answers: list[int] = []

        def call() -> None:
            answers.append(self.ask(self.connect(), "POST", "/tokenize", b'{"text": "a"}')[0])

        callers = [threading.Thread(target=call) for _ in range(4)]
        for caller in callers:
            caller.start()
        for caller in callers:
            caller.join(5)
        self.assertEqual(answers, [200, 200, 200, 200])

    def test_refuses_a_body_that_is_not_a_text(self) -> None:
        for body in [b"not json", b"{}", b'{"text": 5}', b"[]", b""]:
            with self.subTest(body=body):
                status, answer, _ = self.ask(self.connect(), "POST", "/tokenize", body)
                self.assertEqual((status, answer), (400, {"error": 'expected {"text": string}'}))

    def test_refuses_a_request_that_states_no_length_without_waiting_for_a_body(self) -> None:
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_address[1], timeout=2)
        self.addCleanup(connection.close)
        connection.putrequest("POST", "/tokenize")
        connection.endheaders()
        response = connection.getresponse()
        self.assertEqual((response.status, json.loads(response.read())), (400, {"error": 'expected {"text": string}'}))

    def test_knows_only_tokenize_and_health(self) -> None:
        connection = self.connect()
        self.assertEqual(self.ask(connection, "GET", "/health")[:2], (200, {"ok": True}))
        self.assertEqual(self.ask(connection, "GET", "/other")[:2], (404, {"error": "not found"}))
        self.assertEqual(self.ask(connection, "POST", "/other", b"{}")[:2], (404, {"error": "not found"}))


if __name__ == "__main__":
    unittest.main()
