#!/usr/bin/env python3
"""Check, render and file the build plan in issues.py.

  plan.py check    validate keys, blockers, cycles, milestones and spec links
  plan.py render   rewrite the generated part of docs/build-plan.md
  plan.py file     create labels, milestones and issues (idempotent by title),
                   set native blocked-by dependencies and ready/blocked labels,
                   record numbers in filed.json, then render again
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from issues import ISSUES, M1, M2, M3  # noqa: E402

REPO = "LorexGitHub/ibbun"
DOCS_URL = f"https://github.com/{REPO}/blob/main/docs/"
FILED = os.path.join(HERE, "filed.json")
DOC = os.path.join(ROOT, "docs", "build-plan.md")
BEGIN, END = "<!-- BEGIN GENERATED -->", "<!-- END GENERATED -->"
MILESTONES = [M1, M2, M3]
BY_KEY = {i["key"]: i for i in ISSUES}


def slug(heading):
    return re.sub(r"[^\w\- ]", "", heading.strip().lower()).replace(" ", "-")


def anchors(path):
    with open(path, encoding="utf-8") as f:
        return {slug(m.group(1)) for m in re.finditer(r"^#+\s+(.*)$", f.read(), re.M)}


def check():
    errors = []
    if len(BY_KEY) != len(ISSUES):
        errors.append("duplicate keys")
    if len({i["title"] for i in ISSUES}) != len(ISSUES):
        errors.append("duplicate titles")
    for i in ISSUES:
        for b in i["blocked_by"]:
            if b not in BY_KEY:
                errors.append(f"{i['key']}: unknown blocker {b}")
            elif MILESTONES.index(BY_KEY[b]["milestone"]) > MILESTONES.index(i["milestone"]):
                errors.append(f"{i['key']} ({i['milestone']}) blocked by later {b}")
        for s in i["spec"]:
            path, _, anchor = s.partition("#")
            full = os.path.join(ROOT, "docs", path)
            if not os.path.exists(full):
                errors.append(f"{i['key']}: missing doc {path}")
            elif anchor and anchor not in anchors(full):
                errors.append(f"{i['key']}: missing anchor {s}")
    depth = {}

    def visit(k, stack=()):
        if k in stack:
            errors.append("cycle: " + " -> ".join(stack + (k,)))
            return 0
        if k not in depth:
            depth[k] = 1 + max((visit(b, stack + (k,)) for b in BY_KEY[k]["blocked_by"] if b in BY_KEY), default=-1)
        return depth[k]

    for k in BY_KEY:
        visit(k)
    return errors, depth


def filed():
    return json.load(open(FILED)) if os.path.exists(FILED) else {}


def ref(key, numbers):
    return f"#{numbers[key]}" if key in numbers else f"`{key}`"


def render():
    errors, depth = check()
    if errors:
        sys.exit("\n".join(errors))
    numbers = filed()
    out = []
    for m in MILESTONES:
        rows = sorted((i for i in ISSUES if i["milestone"] == m), key=lambda i: (depth[i["key"]], ISSUES.index(i)))
        out += [f"### {m} ({len(rows)} issues)", "",
                "| Issue | Type | Layer | Folder | Blocked by |", "|---|---|---|---|---|"]
        for i in rows:
            blockers = ", ".join(ref(b, numbers) for b in i["blocked_by"]) or "none"
            out.append(f"| {ref(i['key'], numbers)} {i['title']} | `{i['type']}` | {depth[i['key']]} | `{i['folder']}` | {blockers} |")
        out.append("")
    layers = max(depth.values()) + 1
    out += [f"{len(ISSUES)} issues in {layers} layers. An issue's layer is one more than its deepest blocker's; "
            "everything in one layer can run in parallel once the layer before it is closed.", ""]
    text = open(DOC, encoding="utf-8").read()
    pre, _, rest = text.partition(BEGIN)
    _, _, post = rest.partition(END)
    open(DOC, "w", encoding="utf-8").write(pre + BEGIN + "\n\n" + "\n".join(out) + "\n" + END + post)


def gh(*args, input=None):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, input=input)
    if r.returncode:
        raise RuntimeError(f"gh {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout


def body(i, numbers):
    spec = "\n".join(f"- [{s}]({DOCS_URL}{s})" for s in i["spec"])
    crit = "\n".join(f"- [ ] {c}" for c in i["criteria"])
    blockers = "\n".join(f"Blocked by {ref(b, numbers)}" for b in i["blocked_by"]) or "Blocked by nothing."
    if i["type"] == "wave-0":  # the gates and verify-ibbun are themselves Wave 0 issues
        done = ("- [ ] Every CI gate that exists on `main` passes; work in ub-mode\n"
                "- [ ] Once `verify-ibbun` exists, its feature map covers this module")
    else:
        done = (f"- [ ] All CI gates pass ([architecture.md]({DOCS_URL}architecture.md#done-for-a-slice-or-core-change)); work in ub-mode\n"
                "- [ ] `verify-ibbun/features/` file for this slice added or updated with `/maintain-verification-skill`\n"
                "- [ ] A separate verifier agent attached passing `verify-ibbun` evidence to the PR")
    return f"""Part of the build plan ([docs/build-plan.md]({DOCS_URL}build-plan.md), #40). Plan key: `{i['key']}`.

## Folder

`{i['folder']}`. Change nothing outside it except additive core changes ([architecture.md]({DOCS_URL}architecture.md#changing-the-core)).

## Spec

The docs are authoritative; these criteria point into them.

{spec}

## Acceptance criteria

{crit}
{done}

## Blocked by

{blockers}
"""


def file_issues():
    errors, depth = check()
    if errors:
        sys.exit("\n".join(errors))
    for name, color in [("ready-for-agent", "0e8a16"), ("blocked", "b60205"),
                        ("wave-0", "5319e7"), ("slice", "1d76db"), ("seed", "c5def5")]:
        gh("label", "create", name, "--repo", REPO, "--color", color, "--force")
    existing_ms = {m["title"] for m in json.loads(gh("api", f"repos/{REPO}/milestones?state=all&per_page=100"))}
    for m in MILESTONES:
        if m not in existing_ms:
            gh("api", f"repos/{REPO}/milestones", "-f", f"title={m}")
    existing = {x["title"]: x["number"] for x in json.loads(
        gh("issue", "list", "--repo", REPO, "--state", "all", "--limit", "500", "--json", "title,number"))}
    numbers = filed()
    order = sorted(ISSUES, key=lambda i: depth[i["key"]])
    for i in order:
        if i["key"] not in numbers and i["title"] in existing:
            numbers[i["key"]] = existing[i["title"]]
        if i["key"] not in numbers:
            url = gh("issue", "create", "--repo", REPO, "--title", i["title"], "--milestone", i["milestone"],
                     "--label", i["type"], "--body-file", "-", input=body(i, numbers)).strip()
            numbers[i["key"]] = int(url.rsplit("/", 1)[1])
            json.dump(numbers, open(FILED, "w"), indent=1)
            print("created", i["key"], url)
    for i in order:  # second pass: bodies now resolve every blocker to a number
        n = numbers[i["key"]]
        gh("issue", "edit", str(n), "--repo", REPO, "--body-file", "-", input=body(i, numbers))
        have = {d["number"] for d in json.loads(gh("api", f"repos/{REPO}/issues/{n}/dependencies/blocked_by"))}
        for b in i["blocked_by"]:
            if numbers[b] not in have:
                bid = json.loads(gh("api", f"repos/{REPO}/issues/{numbers[b]}"))["id"]
                gh("api", "-X", "POST", f"repos/{REPO}/issues/{n}/dependencies/blocked_by", "-F", f"issue_id={bid}")
        ready = not i["blocked_by"]
        gh("issue", "edit", str(n), "--repo", REPO,
           "--add-label", "ready-for-agent" if ready else "blocked",
           "--remove-label", "blocked" if ready else "ready-for-agent")
    json.dump(numbers, open(FILED, "w"), indent=1)
    render()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "check":
        errs, d = check()
        print("\n".join(errs) or f"ok: {len(ISSUES)} issues, {max(d.values()) + 1} layers")
        sys.exit(1 if errs else 0)
    {"render": render, "file": file_issues}[cmd]()
