"""Count JMdict entries whose first form is one UniDic token with an accent.

Also counts entries with a headword on Wiktionary carrying a Tōkyō
pitch-accent category (needs ja.jsonl from kaikki.org).

Usage (from the work directory holding JMdict_e.gz and ja.jsonl):
    python jmdict_coverage.py [UNIDIC_DIR]
"""
import collections
import gzip
import sys
import xml.etree.ElementTree as ET

import fugashi

from fetch_reference import headwords_with_accent

COMMON = {"news1", "ichi1", "spec1", "spec2", "gai1"}


def katakana(text):
    return "".join(chr(ord(c) + 96) if "ぁ" <= c <= "ゖ" else c for c in text)


def main():
    unidic = sys.argv[1] if len(sys.argv) > 1 else None
    tagger = fugashi.Tagger(f"-d {unidic} -r {unidic}/dicrc") if unidic else fugashi.Tagger()
    wiktionary = headwords_with_accent("ja.jsonl")
    counts = collections.Counter()
    for _, entry in ET.iterparse(gzip.open("JMdict_e.gz"), events=("end",)):
        if entry.tag != "entry":
            continue
        kanji = [e.text for e in entry.iter("keb")]
        readings = [e.text for e in entry.iter("reb")]
        priorities = [p.text for p in entry.iter("ke_pri")] + [p.text for p in entry.iter("re_pri")]
        form = kanji[0] if kanji else readings[0]
        tokens = list(tagger(form))
        kana = "".join(getattr(t.feature, "kana", None) or "" for t in tokens)
        for group in ["all"] + (["common"] if COMMON & set(priorities) else []):
            counts[group, "entries"] += 1
            if len(tokens) == 1 and kana == katakana(readings[0]) \
                    and getattr(tokens[0].feature, "aType", None) not in (None, "*", ""):
                counts[group, "UniDic: one token, reading matches, has aType"] += 1
            elif kana == katakana(readings[0]):
                counts[group, "UniDic: several tokens"] += 1
            else:
                counts[group, "UniDic: reading differs or unknown"] += 1
            counts[group, "Wiktionary: a form has an accent category"] += any(
                f in wiktionary for f in kanji + readings)
        entry.clear()
    for key, value in sorted(counts.items()):
        print(f"{key[0]:7s} {key[1]:48s} {value}")


if __name__ == "__main__":
    main()
