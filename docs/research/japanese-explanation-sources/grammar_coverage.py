"""Coverage of hanabira Grammar Points (N5-N1) by ja Wiktionary and Wikidata Lexemes.

A Grammar Point title such as "Verb ないではおかない (~ nai de wa okanai)" is reduced to its
Japanese chunks ("ないではおかない"). "exact": the joined pattern is a headword with a real
Japanese definition. "chunk": every chunk of a multi-part pattern is such a headword (e.g.
から…にかけて), which yields a definition of the parts, not of the pattern.

Usage: python3 -I grammar_coverage.py DATA_DIR
"""
import glob
import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

data = Path(sys.argv[1])
REDIRECT = re.compile(r"(参照|の漢字表記|の旧字体|の異体字|の別表記|に同じ|の略|の表記揺れ)[。.]?\s*$")

wikt = defaultdict(list)
for line in open(data / "kaikki-ja-japanese.jsonl", encoding="utf-8"):
    e = json.loads(line)
    for s in e.get("senses", []):
        g = "".join(s.get("glosses", [])).strip()
        if g and not s.get("form_of") and not REDIRECT.search(g):
            wikt[e["word"]].append((e.get("pos"), g))

wd = set()
for line in open(data / "wd_ja_lemmas.tsv", encoding="utf-8"):
    m = re.match(r'"(.*)"@', line)
    if m:
        wd.add(m.group(1))

JA = re.compile(r"[぀-ヿ一-鿿々]+")


def chunks(title):
    title = re.sub(r"\([^()]*[A-Za-z][^()]*\)\s*$", "", title)  # drop trailing romaji gloss
    return JA.findall(title)


per = defaultdict(Counter)
hits = []
random.seed(24)
for f in sorted(glob.glob(str(data / "hanabira/grammar_json/*.json"))):
    level = re.search(r"_(N\d)_", f).group(1)
    for gp in json.load(open(f, encoding="utf-8")):
        ch = chunks(gp["title"])
        joined = "".join(ch)
        per[level]["total"] += 1
        if joined in wikt:
            per[level]["wikt_exact"] += 1
            hits.append((level, gp["title"], wikt[joined][0]))
        elif len(ch) > 1 and all(c in wikt for c in ch):
            per[level]["wikt_chunk"] += 1
        if joined in wd:
            per[level]["wd_exact"] += 1

cols = ["total", "wikt_exact", "wikt_chunk", "wd_exact"]
print("level", *cols)
t = Counter()
for level in sorted(per, reverse=True):
    t.update(per[level])
    print(level, *(per[level][c] for c in cols))
print("all", *(t[c] for c in cols))
for level, title, (pos, g) in random.sample(hits, 15):
    print(level, title, "|", pos, "|", g[:80])

GRAM = {"particle", "suffix", "phrase", "conj", "aux", "auxiliary", "postp", "infix", "affix"}
pos_seen = Counter()
gram_hits = defaultdict(list)
for level, title, _ in hits:
    j = "".join(chunks(title))
    poses = {p for p, _ in wikt[j]}
    pos_seen.update(poses)
    if poses & GRAM:
        gram_hits[level].append((title, [g for p, g in wikt[j] if p in GRAM][0]))
print("pos on exact hits", pos_seen.most_common())
print("exact hits with a grammatical POS entry", {k: len(v) for k, v in gram_hits.items()}, sum(len(v) for v in gram_hits.values()))
for level in sorted(gram_hits, reverse=True):
    for title, g in gram_hits[level]:
        print("G", level, title, "|", g[:70])
