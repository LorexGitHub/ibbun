# Tests for plan.py: check, render, body and file_issues on synthetic data.
# No network: file_issues runs against a fake gh. Coverage is collected in CI
# into target/coverage/python/lcov.info for crapper, like the Sudachi sidecar.
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plan


def issue(key, title=None, milestone=None, blocked_by=(), spec=(), type="slice", folder="slices/x"):
    return {"key": key, "title": title or f"{key} title", "milestone": milestone or plan.M1,
            "blocked_by": list(blocked_by), "spec": list(spec), "type": type,
            "folder": folder, "criteria": [f"{key} criterion"]}


class PlanTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        self.doc = os.path.join(tmp, "build-plan.md")
        self.filed = os.path.join(tmp, "filed.json")
        self.docs = os.path.join(tmp, "docs")
        os.mkdir(self.docs)
        plan.DOC, plan.FILED, plan.ROOT = self.doc, self.filed, tmp
        plan.REPO = "x"

    def setData(self, issues):
        plan.ISSUES = issues
        plan.BY_KEY = {i["key"]: i for i in issues}

    def setDoc(self, text):
        with open(self.doc, "w", encoding="utf-8") as f:
            f.write(text)

    def docText(self):
        with open(self.doc, encoding="utf-8") as f:
            return f.read()

    # --- check ------------------------------------------------------------
    def test_check_ok(self):
        self.setData([issue("a"), issue("b", blocked_by=["a"])])
        errors, depth = plan.check()
        self.assertEqual(errors, [])
        self.assertEqual(depth, {"a": 0, "b": 1})

    def test_check_duplicate_keys_and_titles(self):
        self.setData([issue("a"), issue("a", title="other"), issue("t", title="same"), issue("u", title="same")])
        errors, _ = plan.check()
        self.assertIn("duplicate keys", errors)
        self.assertIn("duplicate titles", errors)

    def test_check_unknown_blocker(self):
        self.setData([issue("a", blocked_by=["nope"])])
        errors, _ = plan.check()
        self.assertIn("a: unknown blocker nope", errors)

    def test_check_blocker_in_later_milestone(self):
        self.setData([issue("a", milestone=plan.M1, blocked_by=["b"]), issue("b", milestone=plan.M2)])
        errors, _ = plan.check()
        self.assertEqual([e for e in errors if "blocked by later" in e], ["a (M1: first playable) blocked by later b"])

    def test_check_missing_doc(self):
        self.setData([issue("a", spec=["missing.md"])])
        errors, _ = plan.check()
        self.assertIn("a: missing doc missing.md", errors)

    def test_check_missing_anchor(self):
        with open(os.path.join(self.docs, "real.md"), "w", encoding="utf-8") as f:
            f.write("# Real\n\n## Section\n")
        self.setData([issue("a", spec=["real.md#nope", "real.md#section"])])
        errors, _ = plan.check()
        self.assertEqual(errors, ["a: missing anchor real.md#nope"])

    def test_check_cycle(self):
        self.setData([issue("a", blocked_by=["b"]), issue("b", blocked_by=["a"])])
        errors, depth = plan.check()
        self.assertTrue(any(e.startswith("cycle:") for e in errors))
        self.assertEqual(depth, {"a": 2, "b": 1})

    # --- render -----------------------------------------------------------
    def test_render_exits_on_errors(self):
        self.setData([issue("a", blocked_by=["nope"])])
        self.setDoc("pre\n")
        with self.assertRaises(SystemExit):
            plan.render()

    def test_render_rewrites_generated_section(self):
        self.setData([issue("a"), issue("b", blocked_by=["a"], type="wave-0"),
                      issue("c", milestone=plan.M2)])
        self.setDoc("before\n<!-- BEGIN GENERATED -->\nold\n<!-- END GENERATED -->\nafter\n")
        with open(self.filed, "w") as f:
            json.dump({"a": "3"}, f)
        plan.render()
        text = self.docText()
        self.assertIn("#3 a title", text)         # filed number resolves the key
        self.assertIn("`b`", text)               # the unfiled issue stays a key
        self.assertIn("| `b` b title | `wave-0` | 1 | `slices/x` | #3 |", text)
        self.assertIn("none", text)              # an issue with no blockers
        self.assertIn("3 issues in 2 layers", text)
        self.assertTrue(text.startswith("before\n<!-- BEGIN GENERATED -->\n"))
        self.assertTrue(text.endswith("<!-- END GENERATED -->\nafter\n"))

    def test_render_no_blockers_and_empty_milestone(self):
        self.setData([issue("a")])
        self.setDoc("<!-- BEGIN GENERATED --><!-- END GENERATED -->")
        plan.render()
        self.assertIn("### " + plan.M2 + " (0 issues)", self.docText())

    # --- body -------------------------------------------------------------
    def test_body_wave0_and_normal(self):
        self.setData([issue("a", type="wave-0"), issue("b", blocked_by=["a"]),
                      issue("c", spec=["real.md#real"])])
        with open(os.path.join(self.docs, "real.md"), "w") as f:
            f.write("x\n")
        numbers = {"a": "3"}
        w0 = plan.body(plan.ISSUES[0], numbers)
        self.assertIn("Once `verify-ibbun` exists", w0)
        self.assertNotIn("verify-ibbun/features/", w0)
        normal = plan.body(plan.ISSUES[1], numbers)
        self.assertIn("verify-ibbun/features/", normal)
        self.assertIn("Blocked by #3", normal)
        nothing = plan.body(plan.ISSUES[2], {"a": "3"})
        self.assertIn("Blocked by nothing.", nothing)
        self.assertIn("real.md#real", nothing)

    # --- file_issues ------------------------------------------------------
    def fake_gh(self, calls):
        """A gh stand-in keyed by the first argument words of each call."""
        def gh(*args, input=None):
            calls.append(args)
            a = " ".join(str(x) for x in args)
            if a.startswith("api repos/x/milestones?state"):
                return json.dumps([{"title": plan.M1}])
            if a.startswith("api repos/x/issues/") and a.endswith("/dependencies/blocked_by"):
                return "[]"
            if a.startswith("api repos/x/issues/"):
                return json.dumps({"id": 99})
            if a.startswith("issue list"):
                return json.dumps([{"title": "a title", "number": 5}])
            if a.startswith("issue create"):
                n = sum(1 for c in calls if c[0] == "issue" and c[1] == "create")
                return f"https://github.com/x/y/issues/{10 + n}"
            return ""
        return gh

    def test_file_issues_files_and_labels(self):
        self.setData([issue("a"), issue("b", blocked_by=["a"], type="wave-0"),
                      issue("c", milestone=plan.M2)])
        self.setDoc("<!-- BEGIN GENERATED --><!-- END GENERATED -->")
        calls = []
        original_gh = plan.gh
        self.addCleanup(setattr, plan, "gh", original_gh)
        plan.gh = self.fake_gh(calls)
        # filed.json must keep its indented form: capture every json.dump's indent
        real_dump, indents = json.dump, []
        self.addCleanup(setattr, json, "dump", json.dump)
        json.dump = lambda obj, f, **kw: (indents.append(kw.get("indent")), real_dump(obj, f, **kw)) and None
        plan.file_issues()
        joined = "\n".join(" ".join(str(x) for x in c) for c in calls)
        self.assertIn("issue create --repo x", joined)          # c is new
        self.assertNotIn("--title a title", joined)             # a came from the list
        self.assertIn("blocked_by", joined)                     # b's dependency
        # the ready/blocked labels match each issue's blockers
        labels = {}
        for c in calls:
            if "--add-label" in c:
                labels[c[2]] = c[c.index("--add-label") + 1]
        self.assertEqual(labels, {"5": "ready-for-agent", "11": "ready-for-agent", "12": "blocked"})
        # filed.json is written in indented form
        self.assertEqual(set(indents), {1})
        raw = open(self.filed).read()
        self.assertIn('\n "', raw)
        self.assertEqual(json.load(open(self.filed)), {"a": 5, "b": 12, "c": 11})
        self.assertIn("#11", self.docText())                    # render used the numbers

    def test_gh_success_and_failure(self):
        class Ok:
            returncode, stdout, stderr = 0, "out", ""
        calls = []
        original = plan.subprocess.run
        self.addCleanup(setattr, plan.subprocess, "run", original)
        plan.subprocess.run = lambda *a, **k: calls.append((a, k)) or Ok()
        self.assertEqual(plan.gh("label", "create", "x"), "out")
        self.assertEqual(calls[0][0], (["gh", "label", "create", "x"],))
        self.assertTrue(calls[0][1]["capture_output"])
        self.assertTrue(calls[0][1]["text"])
        self.assertIn("input", calls[0][1])

        class Bad:
            returncode, stdout, stderr = 1, "", "boom"
        plan.subprocess.run = lambda *a, **k: Bad()
        with self.assertRaises(RuntimeError) as ctx:
            plan.gh("issue", "create")
        self.assertEqual(str(ctx.exception), "gh issue create: boom")

    def test_file_issues_exits_on_errors(self):
        self.setData([issue("a", blocked_by=["nope"])])
        original_gh = plan.gh
        self.addCleanup(setattr, plan, "gh", original_gh)
        plan.gh = self.fake_gh([])
        with self.assertRaises(SystemExit):
            plan.file_issues()


if __name__ == "__main__":
    unittest.main()
