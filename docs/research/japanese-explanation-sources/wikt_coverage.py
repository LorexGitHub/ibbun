"""Coverage of Waller JLPT Words by ja Wiktionary (kaikki wiktextract, Japanese-language entries).

Usage: python3 -I wikt_coverage.py DATA_DIR
"""
import csv
import json
import re
import sys
from collections import defaultdict, Counter
from pathlib import Path

data = Path(sys.argv[1])

REDIRECT = re.compile(r"(参照|の漢字表記|の旧字体|の異体字|の別表記|を参照|に同じ|の略|の表記揺れ|の誤用|の古い表記)[。.]?\s*$")


def real_glosses(entry):
    out = []
    for s in entry.get("senses", []):
        if s.get("form_of") or s.get("alt_of"):
            continue
        g = "".join(s.get("glosses", [])).strip()
        if not g or REDIRECT.search(g) or len(g) < 3:
            continue
        out.append(g)
    return out


entries = defaultdict(list)  # word -> list of (pos, glosses, redirect targets)
for line in open(data / "kaikki-ja-japanese.jsonl", encoding="utf-8"):
    e = json.loads(line)
    if e.get("lang_code") != "ja":
        continue
    targets = [f["word"] for s in e.get("senses", []) for f in (s.get("form_of", []) + s.get("alt_of", []))]
    for s in e.get("senses", []):  # plain-text cross-references such as "よわい　参照"
        m = re.match(r"^「?([^\s「」]+?)」?\s*(を)?参照", "".join(s.get("glosses", [])))
        if m:
            targets.append(m.group(1))
    entries[e["word"]].append((e.get("pos"), real_glosses(e), targets))


def defs_for(form, depth=0):
    """Real glosses on the page for `form`, following redirects one hop."""
    direct, via = [], []
    for pos, gl, targets in entries.get(form, []):
        if gl:
            direct.append((pos, gl))
        if depth == 0:
            for t in targets:
                d, _ = defs_for(t, 1)
                via.extend(d)
    return direct, via


jm = json.load(open(next(data.glob("jmdict-eng-*.json")), encoding="utf-8"))
jm_senses = {w["id"]: len(w["sense"]) for w in jm["words"]}

results = Counter()
per_level = defaultdict(Counter)
sense_ratio = []
misses = defaultdict(list)
pos_c = Counter()
ambiguous = Counter()
import random
random.seed(24)
samples = defaultdict(list)
for level in ["n5", "n4", "n3", "n2", "n1"]:
    for row in csv.DictReader(open(data / "ylv" / "original_data" / f"{level}.csv", encoding="utf-8")):
        kanji, kana = row["kanji"].strip(), row["kana"].strip()
        head = kanji or kana
        d_head, v_head = defs_for(head)
        d_kana, v_kana = defs_for(kana) if kana != head else ([], [])
        if d_head:
            pos_c.update(pos for pos, _ in d_head)
            tier = "direct"           # definition on the Word's own headword page
            n = sum(len(g) for _, g in d_head)
        elif v_head:
            tier = "via_redirect"     # headword page redirects to the kana page
            if len(v_head) > 1:
                ambiguous[level] += 1
            n = sum(len(g) for _, g in v_head)
        elif d_kana or v_kana:
            tier = "kana_only"        # only a kana page with that reading exists; may be a homophone
            n = 0
        else:
            tier = "none"
            n = 0
            misses[level].append(head)
        per_level[level][tier] += 1
        if tier == "direct":
            samples[level].append((head, d_head[0][1][0]))
        per_level[level]["total"] += 1
        if n and row["jmdict_seq"] in jm_senses:
            sense_ratio.append((n, jm_senses[row["jmdict_seq"]]))

print("level total direct via_redirect kana_only none")
tot = Counter()
for level, c in per_level.items():
    tot.update(c)
    print(level, c["total"], c["direct"], c["via_redirect"], c["kana_only"], c["none"])
print("all", tot["total"], tot["direct"], tot["via_redirect"], tot["kana_only"], tot["none"])
wikt = sorted(a for a, _ in sense_ratio)
jmd = sorted(b for _, b in sense_ratio)
print("median wikt glosses per covered Word:", wikt[len(wikt) // 2], "median JMdict senses:", jmd[len(jmd) // 2])
print("covered Words where wikt glosses < JMdict senses:", sum(a < b for a, b in sense_ratio), "of", len(sense_ratio))
for level in ["n5", "n3", "n1"]:
    print("sample misses", level, misses[level][:25])
print("pos of direct hits", pos_c.most_common(12))
print("via_redirect with >1 entry on kana page (homograph ambiguity):", dict(ambiguous), sum(ambiguous.values()))
for level in ["n5", "n3", "n1"]:
    for h, g in random.sample(samples[level], 8):
        print(level, h, "|", g[:90])
