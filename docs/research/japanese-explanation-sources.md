# Japanese Explanation sources

Research for ticket #24. Question: which open sources can supply a **Japanese Explanation** for every Word sense and Grammar Point? What do they cover, and under what licences? Candidates: ja Wiktionary, Japanese WordNet, and any openly licensed monolingual dictionary. Coverage is measured against JLPT-tagged Words and Grammar Points. If nothing covers enough, the fallback is generated explanations through Content Approval.

Researched 2026-11-05. Coverage numbers were measured by the scripts in [`japanese-explanation-sources/`](japanese-explanation-sources/). `fetch.sh` downloads the inputs, and each script prints the tables below. Anything not confirmed from a primary source is marked **(unconfirmed)**. This is not legal advice.

**Measurement baselines**

- **JLPT Words:** Waller's lists as mapped to JMdict ids by yomitan-jlpt-vocab (`original_data/n5.csv` … `n1.csv`), 8,293 rows: N5 684, N4 640, N3 1,730, N2 1,812, N1 3,427.
- **JLPT Grammar Points:** hanabira.org-japanese-content, 828 Grammar Points: N5 136, N4 124, N3 132, N2 191, N1 245.
- **Matching:** a Word matches on its kanji headword, or on its kana if it has no kanji form. This is word-level coverage, not sense-level; see "Sense alignment" below.

## Summary

| Source | Licence | JLPT Words with a Japanese definition | Grammar Points | Fit for Japanese Explanation |
|---|---|---|---|---|
| **ja Wiktionary** (via kaikki.org wiktextract, dump 2026-11-01) | CC BY-SA 4.0 | **7,685 / 8,293 (92.7%)**. 883 of these must be picked from several homographs on a kana page. | **≤ 107 / 828 (12.9%)** have a headword with a grammatical part of speech, and many of those define the word, not the pattern. | **Best source for Words.** Real 国語辞典-style glosses. Needs alignment to JMdict senses. |
| **Japanese Wordnet 2.1** (bond-lab/wnja) | NICT WordNet-style licence: any use, notice on all copies | 6,529 / 8,293 (78.7%) | None (WordNet has no grammar) | **Poor.** Definitions sit beside the English WordNet glosses they translate, and synsets split Words by English concepts (median 3 per Word). |
| **Wikidata Lexemes** (Japanese, Q5287) | CC0 | 5,719 / 8,293 (69.0%). 72% of matched Words have one glossed sense. | 0 / 828 | **Secondary.** Short, plain glosses with no attribution or ShareAlike terms. Thin on senses. |
| **Commercial 国語辞典** (大辞林, 広辞苑, 明鏡, 新明解, …) | Proprietary | Not checked | Not checked | Not usable. No open licence found. |
| **hanabira.org-japanese-content** | CC BY 4.0 | n/a | 828 / 828, but **in English** | Not a Japanese Explanation source. Its `markdown_grammar_japanese/` files are English explanations of Japanese grammar. |

**Verdict:** ja Wiktionary is enough to seed Japanese Explanations for most Words. It is not enough for Grammar Points. Grammar Points need generated Japanese Explanations through Content Approval. So do the remaining Word senses: Words with no entry, and senses that Wiktionary does not describe.

## ja Wiktionary

### Coverage of JLPT Words

Output of `wikt_coverage.py`:

| Level | Words | Definition on headword page | Via redirect to kana page | Kana page only (possible homophone) | None | Covered (first two) |
|---|---|---|---|---|---|---|
| N5 | 684 | 415 | 233 | 20 | 16 | 648 (94.7%) |
| N4 | 640 | 388 | 205 | 21 | 26 | 593 (92.7%) |
| N3 | 1,730 | 1,284 | 378 | 49 | 19 | 1,662 (96.1%) |
| N2 | 1,812 | 1,149 | 513 | 60 | 90 | 1,662 (91.7%) |
| N1 | 3,427 | 2,225 | 895 | 204 | 103 | 3,120 (91.0%) |
| **All** | **8,293** | **5,461** | **2,224** | **354** | **254** | **7,685 (92.7%)** |

- **How ja Wiktionary stores native words.** Many native-word kanji spellings are stubs that point to a kana page. For example, 会う says "あうの漢字表記。" and 食べる says "たべるの漢字表記。". Other stubs are plain cross-references, such as 弱い → "よわい　参照". The script follows one such hop. The 2,224 "via redirect" Words are covered only through the kana page.
- **Homographs on kana pages.** For 883 of the redirected Words, the kana page holds more than one entry. あう, for example, has three verb entries: 合う, 会う and 遭う. The data does not say which entry belongs to which kanji spelling. Someone, or a model with Content Approval, must pick the right entry.
- **Reading mismatches on kanji pages.** A kanji page can lead with another reading. 利益 first gives the Buddhist reading （りやく）"神や仏から与えられるめぐみ", while the JLPT Word is りえき. 会社 first gives "(歴史的用法・まれ)". So taking "the first gloss" is wrong. Each gloss must be matched to the Word's reading and sense.
- **Misses** are mostly kana-written forms, phrases and set expressions that ja Wiktionary files differently or lacks. Examples: いちばん, 大きな, 誰か, もう一度, かもしれない, お願いします.

### Sense alignment

A Japanese Explanation belongs to a **Word sense**. ibbun's senses come from JMdict. Wiktionary's senses do not line up with them.

- Covered Words have a median of 2 Wiktionary glosses and 1 JMdict sense. Wiktionary is usually finer-grained, or lists archaic and regional senses that JMdict leaves out.
- 1,014 of 7,679 covered Words (13.2%) have **fewer** Wiktionary glosses than JMdict senses. At least one JMdict sense of each of these has no Wiktionary text.
- No mapping exists between Wiktionary gloss ids and JMdict sense numbers. Alignment is new work. It suits an LLM proposal that a person accepts through Content Approval.

### Style

Glosses read like a 国語辞典. They are written in Japanese, use kanji freely, and often add synonyms after the definition. Samples from the run:

- 家族: "血縁関係による親族を基礎として成立する小集団。社会の基本単位。"
- 経由: "出発地から目的地まで行く途中に、ある地点もしくは経路を通過すること。"
- 拒絶: "相手の要求や希望を絶つこと。断ること。"
- ばかり (particle): "範囲を限定することを表す。だけ。のみ。"

Some glosses are a single synonym ("グレー: 灰色。") or start with labels such as （やや古風）. Those need editing before they reach Learners.

### Licence

- ja Wiktionary page footers say text is available under the "クリエイティブ・コモンズ 表示-継承ライセンス" and link to CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/deed.ja . Terms of Use: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use
- **Attribution:** under the Terms of Use, a hyperlink or URL to the page is an acceptable credit **(unconfirmed for re-used dictionary data at this granularity; check with a lawyer)**. Store the page title in Provenance so every Japanese Explanation can link to its source page.
- **ShareAlike:** a Japanese Explanation that is copied or adapted from Wiktionary is CC BY-SA 4.0. Rewording it, by hand or by model, is still an adaptation. ibbun already takes ShareAlike on through JMdict (EDRDG Licence = CC BY-SA 4.0), so this adds no new kind of obligation.
- kaikki.org asks that research cite Ylonen (LREC 2022) and link to kaikki.org. This is a request, not a licence condition: https://kaikki.org/jawiktionary/rawdata.html

### Getting the data

- kaikki.org publishes wiktextract output for the Japanese edition, refreshed about weekly. The run used extraction 2026-11-02 of the 2026-11-01 dump. The Japanese-language file has 153,792 entries (198.8 MB JSONL). Each sense has `glosses`, and redirect stubs carry `form_of`. Source: https://kaikki.org/jawiktionary/rawdata.html
- The raw dump is `jawiktionary-latest-pages-articles.xml.bz2`, 95.3 MB, last modified 2026-11-01: https://dumps.wikimedia.org/jawiktionary/latest/

## Japanese Wordnet

- **Release:** wnja 2.1 (2026-10). It has 67,509 synsets, 90,706 lexical entries, 148,703 senses and 67,064 Japanese definitions. Source: https://github.com/bond-lab/wnja (README).
- **Coverage:** 6,529 / 8,293 JLPT Words (78.7%) have at least one synset with a Japanese definition. By level: N5 575/684, N4 514/640, N3 1,532/1,730, N2 1,293/1,812, N1 2,615/3,427. Source: `wnja_coverage.py`.
- **The definitions are translations of English WordNet glosses.** The 1.1 release file `wnjpn-def.tab` pairs each Japanese definition with the English Princeton gloss on the same row, for example "bandage to support an injured forearm / 傷ついた前腕を支持する包帯". Who translated them, and how, is **(unconfirmed)**. They read as translations, not as 国語辞典 explanations.
- **Synsets do not match Japanese senses.** Covered Words have a median of 3 synsets (90th percentile: 9). 会う's synsets include "受け入れる、または受ける、しばしば嫌々に", which is English *meet* in the sense of "meet with". 青い gets three colour synsets split along English lines. Matching synsets to JMdict senses would be harder than matching Wiktionary glosses.
- **Licence:** a NICT WordNet-style licence. It grants "Permission to use, copy, modify and distribute this software and database and its documentation for any purpose and without fee or royalty", provided the copyright notice and disclaimer "appear on ALL copies". NICT's name may not be used in advertising. There is no ShareAlike, and commercial use is allowed. Source: https://github.com/bond-lab/wnja/blob/master/docs/license.txt
- **Use:** not as an Explanation source. It may help as a hint when aligning senses.

## Wikidata Lexemes

- **Licence:** CC0. "All structured data from the main, Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License". Source: https://www.wikidata.org/wiki/Wikidata:Copyright
- **Size** (SPARQL, 2026-11-05): 30,205 Japanese Lexemes, and 33,907 senses with a Japanese gloss.
- **Coverage:** 5,719 / 8,293 JLPT Words (69.0%). By level: N5 517, N4 511, N3 1,393, N2 1,140, N1 2,158. 72.3% of matched Words have only one glossed sense. Source: `wd_coverage.py`.
- **Style:** short glosses. Examples: 食べる "食物を口から摂取すること", 可能 "できること", 拒絶 "拒むこと", 家族 "家内のもの".
- **Provenance risk:** where the Japanese glosses came from is **(unconfirmed)**. CC0 is only as good as each contributor's right to give up the text. Spot-check glosses against commercial dictionaries before relying on them.
- **No Grammar Points:** none of the 828 Grammar Point patterns is a Lexeme lemma with a Japanese gloss.

## Grammar Points

Output of `grammar_coverage.py`. Each hanabira title is reduced to its Japanese part: "Verb ないではおかない (~ nai de wa okanai)" becomes ないではおかない.

| Level | Grammar Points | Exact ja Wiktionary headword | Only the separate parts are headwords | Wikidata Lexeme |
|---|---|---|---|---|
| N5 | 136 | 59 | 9 | 0 |
| N4 | 124 | 32 | 29 | 0 |
| N3 | 132 | 33 | 11 | 0 |
| N2 | 191 | 43 | 7 | 0 |
| N1 | 245 | 18 | 13 | 0 |
| **All** | **828** | **185 (22.3%)** | **69** | **0** |

- **Most exact matches are other words.** Of the 185 exact matches, only 107 have a headword with a grammatical part of speech (particle, suffix, conjunction, phrase, affix). The rest are homographs: いつか → "月の5番目の日", つつ → 筒, たて → 縦.
- **The 107 are an upper bound.** Many define the bare word, not the pattern. "Noun で～" matches the noun 甲斐 sense of で, and "～の" matches a counter for cloth widths. Good matches cluster in conjunctions (しかし, したがって, ところで), particles (ばかり, こそ, さえ) and suffixes (～がち, ～気味, ～だらけ). Set patterns such as ～ないではおかない, ～にかけて and ～ずにはすまない have no entry.
- **Conclusion:** no open source covers JLPT Grammar Points in Japanese. Generate them through Content Approval. Matching ja Wiktionary entries can be shown to the reviewer as reference, about a hundred of them, mostly N5 to N3.

## Consequences for ibbun

- **Words: seed from ja Wiktionary.** Follow kanji → kana redirects, then pick the entry and gloss for the Word's reading. Align glosses to JMdict senses. A model proposes; Content Approval decides. Record Provenance as "ja Wiktionary, page title, dump date, CC BY-SA 4.0" per Japanese Explanation, plus "edited" or "generated" when it was changed.
- **Gaps: generate.** About 7% of JLPT Words have no usable Wiktionary entry (608 of 8,293). Many more senses are missing: at least one JMdict sense in each of 1,014 Words. Generate these as drafts for Content Approval.
- **Grammar Points: generate all of them,** through Content Approval. Use ja Wiktionary as a reference only where a grammatical entry exists.
- **Wikidata Lexemes (CC0)** can be a fallback for Words with no Wiktionary entry, after the provenance spot-check. **Japanese Wordnet** is not used for Explanations.
- **ShareAlike:** Wiktionary-derived Japanese Explanations are CC BY-SA 4.0, like JMdict data. Generated ones are under our own terms, unless they were generated *from* a Wiktionary gloss.
- **Open questions:** (1) Lawyer: does a per-Explanation link to the Wiktionary page meet CC BY-SA 4.0 attribution in the app UI? (2) Where did the Wikidata Lexeme Japanese glosses come from? (3) Does a model rewrite that was prompted with a Wiktionary gloss count as an adaptation? Treat it as one until told otherwise.

## Sources

- ja Wiktionary: https://ja.wiktionary.org/ ; dumps: https://dumps.wikimedia.org/jawiktionary/latest/
- kaikki.org ja edition: https://kaikki.org/jawiktionary/rawdata.html ; wiktextract: https://github.com/tatuylonen/wiktextract
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/legalcode ; Wikimedia Terms of Use: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use
- Japanese Wordnet: https://github.com/bond-lab/wnja (releases v1.1, v2.1; `docs/license.txt`)
- Wikidata copyright: https://www.wikidata.org/wiki/Wikidata:Copyright ; SPARQL endpoint: https://query.wikidata.org/
- yomitan-jlpt-vocab (Waller → JMdict ids, CC BY-SA 4.0): https://github.com/stephenmk/yomitan-jlpt-vocab
- hanabira.org-japanese-content (CC BY 4.0): https://github.com/tristcoil/hanabira.org-japanese-content
- jmdict-simplified 3.6.2 (JMdict 2026-11-02): https://github.com/scriptin/jmdict-simplified
