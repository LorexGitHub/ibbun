"""Compare UniDic and Open JTalk accents with the Wiktionary reference.

Usage (from the work directory holding wikitext.json and JMdict_e.gz):
    python evaluate.py [UNIDIC_DIR]
With no UNIDIC_DIR, fugashi uses whatever UniDic is installed (unidic-lite).

Strategy measured, per reference reading:
  A. the headword is one UniDic token whose kana matches the reading:
     take aType (first value) from UniDic;
  B. otherwise, if Open JTalk reads the whole headword as one accent phrase
     with the same reading: take Open JTalk's estimated accent;
  C. otherwise: no value.
"""
import collections
import gzip
import json
import re
import sys
import xml.etree.ElementTree as ET

import fugashi
import pyopenjtalk

COMMON = {"news1", "ichi1", "spec1", "spec2", "gai1"}
JA_PRON = re.compile(r"\{\{ja-pron\|([^{}]*)\}\}")


def katakana(text):
    return "".join(chr(ord(c) + 96) if "ぁ" <= c <= "ゖ" else c for c in text)


def japanese_section(wikitext):
    match = re.search(r"^==Japanese==\s*$(.*?)(?=^==[^=]|\Z)", wikitext, re.S | re.M)
    return match.group(1) if match else ""


def reference_readings(word, wikitext, sources):
    """Yield (katakana reading, accepted accent numbers) from ja-pron templates."""
    for template in JA_PRON.finditer(japanese_section(wikitext)):
        positional, named = [], {}
        for part in template.group(1).split("|"):
            if "=" in part:
                key, value = part.split("=", 1)
                named[key.strip()] = value.strip()
            else:
                positional.append(part.strip())
        for i, reading in enumerate(positional or [word]):
            suffix = "" if i == 0 else str(i + 1)
            accents = [0 if v.strip() in ("h", "heiban") else int(v)
                       for v in re.split(r"[,;]", named.get("acc" + suffix, ""))
                       if v.strip().isdigit() or v.strip() in ("h", "heiban")]
            if not accents:
                continue
            refs = named.get("acc" + suffix + "_ref", named.get("acc_ref", ""))
            sources["with acc_ref" if refs else "no acc_ref"] += 1
            for ref in filter(None, refs.split(",")):
                sources["acc_ref " + ref.strip()] += 1
            yield katakana(re.sub(r"[ .\-^%]", "", reading)), accents


def jmdict_common_forms(path):
    forms = set()
    for _, entry in ET.iterparse(gzip.open(path), events=("end",)):
        if entry.tag != "entry":
            continue
        priorities = [p.text for p in entry.iter("ke_pri")] + [p.text for p in entry.iter("re_pri")]
        if COMMON & set(priorities):
            forms.update(e.text for e in entry.iter("keb"))
            forms.update(e.text for e in entry.iter("reb"))
        entry.clear()
    return forms


def main():
    unidic = sys.argv[1] if len(sys.argv) > 1 else None
    tagger = fugashi.Tagger(f"-d {unidic} -r {unidic}/dicrc") if unidic else fugashi.Tagger()
    wikitext = json.load(open("wikitext.json", encoding="utf-8"))
    common = jmdict_common_forms("JMdict_e.gz")
    sources, counts, misses = collections.Counter(), collections.Counter(), []
    with_reference = set()

    for word, text in wikitext.items():
        tokens = list(tagger(word))
        unidic_kana = "".join(t.feature.kana or "" for t in tokens)
        nodes = pyopenjtalk.run_frontend(word)
        openjtalk_kana = "".join(n["read"] for n in nodes)
        phrase_heads = [n for n in nodes if n["chain_flag"] != 1]
        for reading, accents in reference_readings(word, text, sources):
            with_reference.add(word)
            for group in ["all"] + (["common"] if word in common else []):
                counts[group, "readings"] += 1
                single = (len(tokens) == 1 and unidic_kana == reading
                          and tokens[0].feature.aType not in (None, "*"))
                one_phrase = openjtalk_kana == reading and len(phrase_heads) == 1
                if single:
                    values = [int(v) for v in tokens[0].feature.aType.split(",") if v.isdigit()]
                    counts[group, "A UniDic"] += 1
                    counts[group, "A UniDic first value right"] += bool(values and values[0] in accents)
                    counts[group, "A UniDic any value right"] += bool(set(values) & set(accents))
                    if one_phrase:
                        counts[group, "A same words: Open JTalk"] += 1
                        counts[group, "A same words: Open JTalk right"] += phrase_heads[0]["acc"] in accents
                    if group == "all" and not set(values) & set(accents):
                        misses.append(("UniDic", word, reading, accents, values))
                elif one_phrase:
                    counts[group, "B Open JTalk"] += 1
                    counts[group, "B Open JTalk right"] += phrase_heads[0]["acc"] in accents
                    if group == "all" and phrase_heads[0]["acc"] not in accents:
                        misses.append(("OpenJTalk", word, reading, accents, phrase_heads[0]["acc"]))
                else:
                    counts[group, "C no value"] += 1

    print("headwords with a parsable acc=:", len(with_reference), "of", len(wikitext))
    print("reference sources:", sources.most_common())
    for key, value in sorted(counts.items()):
        print(f"{key[0]:7s} {key[1]:35s} {value}")
    for miss in misses[:40]:
        print("miss", *miss)


if __name__ == "__main__":
    main()
