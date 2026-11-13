#!/usr/bin/env bash
# Download the inputs for the coverage scripts into DATA_DIR (default ./data).
# Then run, from DATA_DIR:
#   python3 -I ../wikt_coverage.py .
#   python3 -I ../wnja_coverage.py .
#   python3 -I ../grammar_coverage.py .
#   python3 -I ../wd_coverage.py .
set -euo pipefail
dir="${1:-data}"
mkdir -p "$dir" && cd "$dir"

# ja Wiktionary, Japanese-language entries, extracted by wiktextract (kaikki.org).
curl -sL -o kaikki-ja-japanese.jsonl \
  "https://kaikki.org/jawiktionary/%E6%97%A5%E6%9C%AC%E8%AA%9E/kaikki.org-dictionary-%E6%97%A5%E6%9C%AC%E8%AA%9E.jsonl"

# Japanese Wordnet 2.1 (WN-LMF).
curl -sL -o wnja-2.1.xml https://github.com/bond-lab/wnja/releases/download/v2.1/wnja-2.1.xml

# Waller's JLPT vocabulary mapped to JMdict ids (original_data/n5.csv ... n1.csv).
git clone -q --depth 1 https://github.com/stephenmk/yomitan-jlpt-vocab ylv

# JLPT-tagged Grammar Points.
git clone -q --depth 1 https://github.com/tristcoil/hanabira.org-japanese-content hanabira

# JMdict (English), for sense counts.
curl -sL "https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20261102210542/jmdict-eng-3.6.2%2B20261102210542.json.tgz" | tar xz

# Wikidata Lexemes in Japanese that have at least one sense with a Japanese gloss.
curl -s -G https://query.wikidata.org/sparql -H 'Accept: text/tab-separated-values' \
  -A 'ibbun-research/0.1 (https://github.com/LorexGitHub/ibbun)' \
  --data-urlencode 'query=SELECT ?lemma (COUNT(?s) AS ?n) (SAMPLE(?g) AS ?ex) WHERE { ?l dct:language wd:Q5287 ; wikibase:lemma ?lemma ; ontolex:sense ?s . ?s skos:definition ?g . FILTER(LANG(?g)="ja") } GROUP BY ?lemma' \
  > wd_ja_lemmas.tsv
