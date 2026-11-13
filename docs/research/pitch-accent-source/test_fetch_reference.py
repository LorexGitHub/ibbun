# Tests for fetch_reference.py. No network: urlopen and the sampling are
# mocked, and the exact arguments pin the seed, the batch size and the dumps.
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_reference


class FetchReferenceTest(unittest.TestCase):
    def test_headwords_with_accent(self):
        lines = [
            json.dumps({"word": "天", "senses": [{"tags": ["天"], "categories": ["Japanese terms with Heiban pitch accent (Tōkyō)"]}]}, ensure_ascii=False),
            json.dumps({"word": "戴", "senses": [{"categories": ["Japanese terms with Hōn pitch accent (Tōkyō)"]}]}, ensure_ascii=False),
            json.dumps({"word": "無", "senses": []}, ensure_ascii=False),
        ]
        path = os.path.join(tempfile.mkdtemp(), "ja.jsonl")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        words = fetch_reference.headwords_with_accent(path)
        self.assertEqual(words, {"天"})


class FetchWikitextTest(unittest.TestCase):
    def test_fetch_wikitext(self):
        payload = {"query": {"pages": [
            {"title": "A", "revisions": [{"slots": {"main": {"content": "wikitext A"}}}]},
            {"title": "B"},
        ]}}
        captured = {}

        def fake_urlopen(request):
            captured["url"] = request.full_url
            captured["headers"] = request.headers
            return io.BytesIO(json.dumps(payload).encode())

        with mock.patch.object(fetch_reference.urllib.request, "urlopen", side_effect=fake_urlopen):
            result = fetch_reference.fetch_wikitext(["A", "B"])
        self.assertEqual(result, {"A": "wikitext A"})     # B carries no revisions and is skipped
        self.assertIn("https://en.wiktionary.org/w/api.php?", captured["url"])
        self.assertIn("action=query", captured["url"])
        self.assertIn("titles=A%7CB", captured["url"])
        self.assertTrue(any(v == fetch_reference.USER_AGENT for v in captured["headers"].values()))


class MainTest(unittest.TestCase):
    def test_main(self):
        seen = {"seed": [], "sample": [], "sleep": [], "dump": [], "chunks": [], "open": []}
        with mock.patch.object(fetch_reference, "headwords_with_accent", return_value={"b", "c", "a"}) as hw, \
             mock.patch.object(fetch_reference.random, "seed", side_effect=seen["seed"].append), \
             mock.patch.object(fetch_reference.random, "sample",
                               side_effect=lambda seq, k: seen["sample"].append((list(seq), k)) or list(seq)), \
             mock.patch.object(fetch_reference.time, "sleep", side_effect=seen["sleep"].append), \
             mock.patch.object(fetch_reference, "fetch_wikitext",
                               side_effect=lambda chunk: seen["chunks"].append(list(chunk)) or {"x": "w"}), \
             mock.patch.object(fetch_reference.json, "dump",
                               side_effect=lambda obj, f, **kw: seen["dump"].append((obj, kw))), \
             mock.patch("builtins.open", side_effect=lambda f, *a: seen["open"].append(f) or io.StringIO()):
            fetch_reference.main()
        hw.assert_called_once_with("ja.jsonl")
        self.assertEqual(seen["seed"], [25])
        self.assertEqual(seen["sample"], [(["a", "b", "c"], 800)])
        self.assertEqual(seen["chunks"], [["a", "b", "c"]])   # fewer than 50 headwords: one batch
        self.assertEqual(seen["sleep"], [1])
        self.assertEqual([o for o in seen["open"]], ["sample.json", "wikitext.json"])
        self.assertEqual(seen["dump"], [(["a", "b", "c"], {"ensure_ascii": False}),
                                        ({"x": "w"}, {"ensure_ascii": False})])


if __name__ == "__main__":
    unittest.main()
