"""Build the Wiktionary reference sample used to measure derived pitch accent.

Reads kaikki.org's Japanese JSONL, picks 800 random headwords that carry a
Tōkyō pitch-accent category, and fetches their raw wikitext from the
Wiktionary API so the exact `{{ja-pron|acc=...}}` values can be read.

Usage (from a work directory holding ja.jsonl):
    python fetch_reference.py
Writes sample.json and wikitext.json, and prints headword coverage.
"""
import json
import random
import re
import time
import urllib.parse
import urllib.request

CATEGORY = re.compile(
    r"Japanese terms with (Heiban|Atamadaka|Nakadaka|Odaka) pitch accent \(Tōkyō\)"
)
USER_AGENT = "ibbun-research/0.1 (https://github.com/LorexGitHub/ibbun)"


def headwords_with_accent(path):
    words = set()
    for line in open(path, encoding="utf-8"):
        if "pitch accent (T" in line and CATEGORY.search(line):
            words.add(json.loads(line)["word"])
    return words


def fetch_wikitext(titles):
    url = "https://en.wiktionary.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "prop": "revisions", "rvprop": "content",
        "rvslots": "main", "format": "json", "formatversion": "2",
        "titles": "|".join(titles),
    })
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    pages = json.load(urllib.request.urlopen(request))["query"]["pages"]
    return {p["title"]: p["revisions"][0]["slots"]["main"]["content"]
            for p in pages if "revisions" in p}


def main():
    words = headwords_with_accent("ja.jsonl")
    print("headwords with a Tōkyō pitch category:", len(words))
    random.seed(25)
    sample = random.sample(sorted(words), 800)
    json.dump(sample, open("sample.json", "w"), ensure_ascii=False)
    wikitext = {}
    for i in range(0, len(sample), 50):
        wikitext.update(fetch_wikitext(sample[i:i + 50]))
        time.sleep(1)
    json.dump(wikitext, open("wikitext.json", "w"), ensure_ascii=False)
    print("wikitext pages fetched:", len(wikitext))


if __name__ == "__main__":
    main()
