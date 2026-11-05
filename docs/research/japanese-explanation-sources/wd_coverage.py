"""Coverage of Waller JLPT Words by Wikidata Lexemes with a Japanese gloss (wd_ja_lemmas.tsv).

Usage: python3 -I wd_coverage.py DATA_DIR
"""
import csv
import re
import sys
from collections import Counter
from pathlib import Path

data = Path(sys.argv[1])
senses = {}  # lemma -> number of senses with a Japanese gloss
for line in open(data / "wd_ja_lemmas.tsv", encoding="utf-8"):
    f = line.rstrip("\n").split("\t")
    m = re.match(r'"(.*)"@', f[0])
    if m:
        senses[m.group(1)] = int(re.match(r'"?(\d+)', f[1]).group(1))
print("lemma strings with a Japanese gloss", len(senses))

per = Counter()
counts = []
for level in ["n5", "n4", "n3", "n2", "n1"]:
    for row in csv.DictReader(open(data / "ylv" / "original_data" / f"{level}.csv", encoding="utf-8")):
        head = row["kanji"].strip() or row["kana"].strip()
        per[level, "total"] += 1
        if head in senses:
            per[level, "hit"] += 1
            counts.append(senses[head])
for level in ["n5", "n4", "n3", "n2", "n1"]:
    print(level, per[level, "total"], per[level, "hit"])
print("all", sum(per[l, "total"] for l in ["n5", "n4", "n3", "n2", "n1"]), len(counts))
counts.sort()
print("median glossed senses per covered Word", counts[len(counts) // 2],
      "share with one sense", round(sum(c == 1 for c in counts) / len(counts), 3))
