"""Coverage of Waller JLPT Words by Japanese Wordnet 2.1 (lemma or kana form match).

Usage: python3 -I wnja_coverage.py DATA_DIR
"""
import csv
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

data = Path(sys.argv[1])
root = ET.parse(data / "wnja-2.1.xml").getroot()
lex = root.find("Lexicon")
defs = {s.get("id"): (s.findtext("Definition") or "") for s in lex.iter("Synset")}
by_form = defaultdict(set)  # written form -> synset ids
for e in lex.iter("LexicalEntry"):
    synsets = {s.get("synset") for s in e.iter("Sense")}
    by_form[e.find("Lemma").get("writtenForm")] |= synsets
print("synsets", len(defs), "with Japanese definition", sum(1 for d in defs.values() if d.strip()))
print("lemmas", len(by_form))

per = defaultdict(Counter)
nsyn = []
for level in ["n5", "n4", "n3", "n2", "n1"]:
    for row in csv.DictReader(open(data / "ylv" / "original_data" / f"{level}.csv", encoding="utf-8")):
        head = row["kanji"].strip() or row["kana"].strip()
        syn = {s for s in by_form.get(head, set()) if defs.get(s, "").strip()}
        per[level]["total"] += 1
        if syn:
            per[level]["hit"] += 1
            nsyn.append(len(syn))
t = Counter()
for level, c in per.items():
    t.update(c)
    print(level, c["total"], c["hit"])
print("all", t["total"], t["hit"])
nsyn.sort()
print("median synsets per covered Word", nsyn[len(nsyn) // 2], "p90", nsyn[int(len(nsyn) * 0.9)])
for w in ["会う", "食べる", "青い", "写真", "可能"]:
    for s in sorted(by_form.get(w, []))[:3]:
        print(w, s, defs[s])
