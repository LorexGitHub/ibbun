"""Minimal Sudachi sidecar: POST /tokenize {"text": "..."} -> tokens. GET /health.

Wave 0 only needs the service to run. platform/nlp (#49) owns the adapter and
may extend this response (modes, conjugation forms).
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from sudachipy import dictionary, tokenizer

TOKENIZER = dictionary.Dictionary().create()
MODE = tokenizer.Tokenizer.SplitMode.C
# A SudachiPy tokenizer serves one caller at a time: a second thread inside it raises "Already borrowed".
ONE_AT_A_TIME = threading.Lock()


def tokenize(text: str) -> list[dict]:
    with ONE_AT_A_TIME:
        return [
            {
                "surface": m.surface(),
                "reading": m.reading_form(),
                "lemma": m.dictionary_form(),
                "pos": list(m.part_of_speech()),
            }
            for m in TOKENIZER.tokenize(text, MODE)
        ]


class Handler(BaseHTTPRequestHandler):
    # Keep-alive: an import tokenizes every Sentence, and a new connection per Sentence costs far more than the tokenizing.
    protocol_version = "HTTP/1.1"

    def log_message(self, *args) -> None:
        pass

    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        self._send(200, {"ok": True}) if self.path == "/health" else self._send(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/tokenize":
            return self._send(404, {"error": "not found"})
        try:
            text = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))["text"]
            if not isinstance(text, str):
                raise ValueError
        except (ValueError, KeyError, TypeError):
            return self._send(400, {"error": 'expected {"text": string}'})
        self._send(200, {"tokens": tokenize(text)})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
