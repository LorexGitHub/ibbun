# Pitch accent source

Research for ticket #25. Question: the Content Graph has a pitch-accent field per Word reading that stays empty until a source is approved (#12). Kanjium's pitch data has an undisclosed upstream (#21). Find a pitch-accent source with a known, commercially usable licence: its coverage, format and obligations. Alternatively, check whether pitch can be derived reliably, for example from UniDic accent fields, or from VOICEVOX/Open JTalk accent estimation.

Researched 2026-11-05. Licence claims are cited to the publisher's own pages or to the licence files shipped in the downloads. The coverage and accuracy figures come from our own measurement, run with the scripts in [`pitch-accent-source/`](pitch-accent-source/) (see [Method](#method)). Anything not confirmed from a primary source is marked **(unconfirmed)**. This is not legal advice.

## Summary

**Use UniDic's `aType` field (unidic-cwj 202512, BSD option) as the pitch-accent source for Words that are a single UniDic token. Leave the field empty for the rest.**

- UniDic gives an accent for **79.6 %** of JMdict's common entries (18,019 of 22,650), and for 33.4 % of all 219,024 entries. The rest are compounds and phrases that UniDic splits into several tokens.
- Where it gives one, its first value matches Wiktionary's accent **96.3 %** of the time for common words (283 of 294), and 94.8 % for a random sample of all words (524 of 553).
- The licence is clean: NINJAL, the publisher, offers GPL v2.0 / LGPL v2.1 / modified BSD and says commercial use is free. The BSD option asks only for the copyright notice and licence text.
- **Do not derive accents for compounds.** Open JTalk (the engine VOICEVOX uses) is right for only **63 %** of the words UniDic cannot cover (115 of 182). Its errors are systematic: it misplaces the accent in compounds such as 競争者, 活用語 and 実用的.

No openly licensed accent dictionary beats UniDic. Wiktionary has accents for 75.8 % of common entries under CC BY-SA 4.0. However, 72 % of its accent values cite commercial dictionaries (大辞林, NHK, 新明解) as their source. That is the same kind of provenance problem that ruled out Kanjium, although Wiktionary cites its sources openly. Wadoku and OJAD forbid commercial use without permission.

| Source | Licence | Commercial use | Coverage of JMdict (common / all) | Agreement with Wiktionary | Verdict |
|---|---|---|---|---|---|
| **UniDic cwj 202512 `aType`** | GPL v2.0 / LGPL v2.1 / modified BSD (choose one) | Yes, free | 79.6 % / 33.4 % (single-token Words) | 96.3 % common, 94.8 % all | **Use** |
| **Open JTalk estimation** (`pyopenjtalk`, VOICEVOX) | Modified BSD (code and dictionary) | Yes | Gives a value for almost every Word | 94.8 % on words UniDic already covers; **63–67 % on the rest** | Do not show as fact. Useful as a draft for Content Approval. |
| **Wiktionary** `{{ja-pron\|acc=}}` | CC BY-SA 4.0 + GFDL | Licence allows it | 75.8 % / 19.9 % | (the reference) | Do not ship. 72 % of values cite commercial dictionaries. Fine as a cross-check. |
| **Wadoku** | Own licence ("Wadoku.de-Daten Lizenz" 1.0, 2011) | Only with written permission, renewed yearly | (not measured) | (not measured) | Excluded |
| **OJAD** (Univ. of Tokyo) | Own terms: education and academic research only | No | (not measured) | (not measured) | Excluded |
| **tdmelodic** (PKSHA) | Code BSD-3-Clause; licence of generated dictionaries not stated | (unconfirmed) | Built for NEologd vocabulary | Paper: "over a half of the words" exact | Not needed |
| **Jitendex** | CC BY-SA 4.0 | Licence allows it | about 8,230 entries with audio | (not measured) | Pitch source not named. Excluded. |
| **Kanjium** | CC BY-SA 4.0 label, upstream undisclosed | (see #21) | 124k lines | (not measured) | Excluded by #21 |
| **NHK, 新明解, 大辞林 accent dictionaries** | Commercial publications | No open licence found | (not measured) | (not measured) | Excluded |

## UniDic

### Licence and obligations

- The download page lists 現代書き言葉UniDic (unidic-cwj) and 現代話し言葉UniDic (unidic-csj) **202512** under "GPL v2.0 / LGPL v2.1 / 修正BSD". https://clrd.ninjal.ac.jp/unidic/download.html
- Commercial use: "GPL v2.0/LGPL v2.1/修正BSDのトリプルライセンスですので、営利目的での利用は自由に行うことができます。" (Because it is triple-licensed GPL v2.0 / LGPL v2.1 / modified BSD, commercial use is free.) This applies to modern written UniDic from Ver.2.x on. https://clrd.ninjal.ac.jp/unidic/commerce_use.html
- `unidic-cwj-202512.zip` ships `license/BSD`, `license/GPL`, `license/LGPL` and `license/COPYING`. The BSD file reads "Copyright (c) 2023 National Institute for Japanese Language and Linguistics", followed by the standard 3-clause text. Older builds (unidic-lite 2.1.2) carry "Copyright (c) 2011-2013, The UniDic Consortium".
- The FAQ says how to meet the BSD terms: when distributing software, package the licence files (BSD, AUTHORS); for web apps or print, state AUTHORS and the BSD licence. https://clrd.ninjal.ac.jp/unidic/faq.html#license
- The commerce page also asks that publications state that UniDic was used and that NINJAL be told about them. That reads as a request about research results. Whether it covers a product is **(unconfirmed)**, as #11 found.
- The dialect and historical UniDic editions (for example unidic-novel, unidic-D-kansai) are **CC BY-NC-SA 4.0**. Do not use them. https://clrd.ninjal.ac.jp/unidic/download_all.html

### Format

Each UniDic entry has three accent fields. Our run printed, for example, `橋 … kana='ハシ', aType='2', aConType='C3'` and `箸 … kana='ハシ', aType='1'`.

- `aType`: the mora after which pitch falls, in standard Japanese (標準語). 0 means heiban (no fall). It can hold several comma-separated values, with "more common accent patterns" first, for example `日 aType='0,1'`. This is the same numbering that dictionaries and Wiktionary use, so it maps directly onto our field. Field definitions are from the unidic-py README (https://github.com/polm/unidic-py), because NINJAL's FAQ points to a manual PDF for accent and does not define the fields itself.
- `aConType`: how the word's accent combines with what comes before or after it (for example `C3` on nouns, `動詞%F2@0,名詞%F1` on particles). It drives compound and phrase accent. We do not need it for the Word field.
- `aModType`: rarely filled (unidic-py: under 25 % of entries). Not needed.

UniDic does not say where its accent values come from **(unconfirmed)**. The manual shipped with unidic-lite mentions accent only as information for speech synthesis. The difference from Kanjium is that the licensor is a named national research institute that publishes the data under an explicit licence and states that commercial use is allowed.

### Accuracy and coverage (measured)

See [Method](#method). Reference: 831 accent readings from 769 random Wiktionary headwords. "Common" means the headword is a JMdict entry with a `news1`, `ichi1`, `spec1`, `spec2` or `gai1` priority tag.

| | All sampled readings | Common words |
|---|---|---|
| Headword is one UniDic token with matching reading | 553 of 831 (66.5 %) | 294 of 360 (81.7 %) |
| UniDic's first `aType` value matches Wiktionary | 524 of 553 (**94.8 %**) | 283 of 294 (**96.3 %**) |
| Any `aType` value matches | 532 of 553 (96.2 %) | 289 of 294 (98.3 %) |

Some of the misses are not UniDic errors. The reference picks one sense of a homograph, and UniDic another: あい, 打ち, 都 (ト). Real disagreements include 碁笥, 兆民 and アパタイト.

Coverage across JMdict, taking each entry's first written form and first reading:

| JMdict entries | One UniDic token with matching reading and an accent | Several tokens | Reading differs or unknown |
|---|---|---|---|
| Common (22,650) | **18,019 (79.6 %)** | 3,635 | 996 |
| All (219,024) | 73,141 (33.4 %) | 113,854 | 32,029 |

unidic-lite 2.1.2 gave nearly the same results (527 of 554 right; 18,026 common entries covered). The newer release is not more accurate, but it is the maintained one.

## Deriving accent: Open JTalk and VOICEVOX

- VOICEVOX ENGINE reads text with Open JTalk (pyopenjtalk), as found in #11. Its accent for a word is Open JTalk's accent, unless a user-dictionary entry overrides it.
- Licence: Open JTalk is "released under the Modified BSD license" (https://open-jtalk.sourceforge.net/). pyopenjtalk is MIT. The dictionary pyopenjtalk downloads (`open_jtalk_dic_utf_8-1.11`) ships a `COPYING` with two BSD notices: "Copyright (c) 2009, Nara Institute of Science and Technology" and "Copyright (c) 2011-2017, The UniDic Consortium". The dictionary's accent field uses the form `accent/mora count`, for example `2/3` in pyopenjtalk's README.
- For a single dictionary word, Open JTalk reads the dictionary value, much like UniDic. For compounds, it applies chain rules to estimate the accent. That estimate is what we would need to cover the rest of JMdict.

Measured against the same Wiktionary reference:

| | All sampled readings | Common words |
|---|---|---|
| Words UniDic already covers | 488 of 530 right (92.1 %) | 272 of 287 (94.8 %) |
| **Words UniDic does not cover** (compounds, phrases) | **115 of 182 (63.2 %)** | **26 of 39 (66.7 %)** |
| No value from either (reading mismatch, or several accent phrases) | 96 of 831 | 27 of 360 |

The compound errors follow patterns. Open JTalk is often one mora off for suffix compounds: 活用語 gives 4 where Wiktionary has 0, 実用的 4 vs 0, 平均律 4 vs 3, 繁体字 4 vs 3. It also turns accented compounds heiban: 競争者 0 vs 3, 作詞者 0 vs 3. One in three wrong is too many to show Learners as fact.

### tdmelodic

- PKSHA's tdmelodic "generates a large scale accent dictionary of Japanese (Tokyo dialect) using a neural network based technique", for NEologd entries that lack accent. https://tdmelodic.readthedocs.io/en/stable/
- Code licence BSD-3-Clause. The README, docs and paper do not state a licence for the generated dictionaries **(unconfirmed)**. https://github.com/PKSHATechnology-Research/tdmelodic/blob/master/LICENSE
- Trained on "unidic-mecab_kana-accent-2.1.2" plus 17,200 words annotated by the first author, who "did not know the exact accents of the most of the extracted words, but entered plausible ones". The paper reports per-category exact match only (for example katakana words 78.3 %, kanji/kana 53.5 %) and sums up as "over a half of the words". https://arxiv.org/html/2009.09679v1
- Last commit 2024-03-21. It targets proper nouns and neologisms, not dictionary vocabulary. It is not a better fallback than Open JTalk for us.

## Open dictionaries

### Wiktionary

- Licence: "The original texts of Wiktionary entries are dual-licensed … under both the Creative Commons Attribution-ShareAlike 4.0 International License (CC-BY-SA) and the GNU Free Documentation License (GFDL)." The same page warns that material from external sources keeps its own terms. https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- Format: `{{ja-pron|<kana>|acc=<n>|acc_ref=<sources>}}`, with `acc2=` and so on for further readings. https://en.wiktionary.org/wiki/Template:ja-pron
- Extraction: kaikki.org's processed JSONL (built from the 2026-10-01 dump) keeps only the accent **class** as a category ("Japanese terms with Nakadaka pitch accent (Tōkyō)"), not the accent number. Nakadaka words of four or more morae need the number, so ingesting would mean parsing the wikitext. https://kaikki.org/dictionary/Japanese/index.html
- Coverage: 44,456 kaikki headwords carry a Tōkyō accent category. They cover 17,158 of 22,650 common JMdict entries (75.8 %) and 43,620 of all entries (19.9 %). That is slightly less than UniDic.
- **Provenance.** `acc_ref` names its sources: NHK (NHK日本語発音アクセント辞典, 1998), SMK5 (新明解国語辞典, 5th ed.), DJR (大辞林, 3rd ed.). In our sample, 597 of 831 accent values (72 %) cite one or more of them, and 497 cite 大辞林. The other 234 cite nothing. The values are copied, with citation, from the commercial dictionaries that issue #24 on Kanjium suspected as Kanjium's upstream. Whether bare accent numbers taken this way are protected is a legal question we did not research **(unconfirmed)**.

### Wadoku

- The current licence is the "Wadoku.de-Daten Lizenz", Version 1.0, 10 Aug 2011: https://www.wadoku.de/wiki/display/WAD/Wadoku.de-Daten+Lizenz . The download page says "Alle Daten stehen unter der Wörterbuch Lizenz." https://www.wadoku.de/wiki/display/WAD/Downloads+und+Links
- Section 5.7: every use not listed needs "der ausdrücklichen schriftlichen Genehmigung von Ulrich Apel und Wadoku e.V., die jährlich wieder neu bestätigt werden muss" (explicit written permission, renewed every year). That includes software "die kommerziell verkauft" (sold commercially) and web servers "für deren Benutzung Gebühren erhoben werden oder die kommerzielle Werbung verwenden" (that charge fees or carry ads).
- Accent is an optional part of the reading notation ("Lesung ggf. mit Darstellung des Akzentverlaufs"). https://www.wadoku.de/wiki/display/WAD/Hinweise+zur+Notation . We did not count entries with accent.
- **Excluded** unless we negotiate a licence. The older 2001 licence describes such licences as a one-time payment or a royalty share.

### OJAD

- Terms: "教育・学術研究を目的とした活動に限って利用することができます。営利活動を目的とした企業の研究開発での利用はお控えください。" (May be used only for education and academic research. Please refrain from use in corporate R&D for commercial purposes.) https://www.gavo.t.u-tokyo.ac.jp/ojad/pages/notes
- **Excluded.**

### Jitendex

- CC BY-SA 4.0 (https://jitendex.org/pages/legal.html). Its homepage says about 8,230 audio entries are "also accompanied by pitch accent information", but the legal page names no source for that pitch data. **Excluded** for the same reason as Kanjium.

### Commercial accent dictionaries

- NHK日本語発音アクセント新辞典 (NHK出版, 2016), 新明解日本語アクセント辞典 (三省堂, 2nd ed. 2014) and 大辞林 are commercial publications. We found no open licence and did not ask the publishers **(unconfirmed)**. A licence from one of them is the only route to authoritative accents for compounds.

## Consequences for ibbun

- **Approve UniDic cwj 202512 (BSD option) as the pitch-accent source for Words.** Fill the field when the Word's written form is one UniDic token whose kana matches the reading. That covers about 80 % of common Words.
- **Store a list, not one number.** `aType` can hold several accents in order of frequency (`日` → `0,1`), and so do dictionaries. The field per reading should be an ordered list of accent numbers. Show the first and offer the others.
- **Provenance per value.** Record "UniDic cwj 202512, NINJAL, BSD" on each imported accent. Own corrections get their own Provenance, through the override layer (ADR 0002, still on the `grilling/content-graph-schema` branch).
- **Credits.** Ship UniDic's BSD notice ("Copyright (c) 2023 National Institute for Japanese Language and Linguistics" plus the licence text and AUTHORS) on the credits page, as the FAQ asks. This joins the EDRDG, Tatoeba and VOICEVOX credits from #8 and #11.
- **Leave the rest empty.** Do not show Open JTalk estimates as fact. If we want accents for compounds, use Open JTalk's estimate as a **draft** that needs Content Approval, and cross-check it against Wiktionary internally. A disagreement flags a value to check. It is not a source to copy.
- **Listening Clips are a separate question.** VOICEVOX pronounces with Open JTalk accents. When a Word has an approved accent, pass it to VOICEVOX (accent phrase or user dictionary, see #11) so the audio matches what the Word page shows.
- **Matching method.** Our measurement tokenised the JMdict headword with UniDic. An importer can do the same with fugashi plus the UniDic build. Lindera bundles `unidic-mecab-2.1.2` (#11). Whether that build carries the accent fields is **(unconfirmed)**: NINJAL also published a separate `unidic-mecab_kana-accent` package, and tdmelodic names that one. Whether the 202512 zip includes the source `lex.csv` for a direct lookup is **(unconfirmed)**. It ships only compiled `sys.dic` files.
- **Open questions:** (1) Is a licence from NHK or Sanseido affordable for compound accents? (2) Do bare accent numbers copied from commercial dictionaries carry rights, for Wiktionary's or Kanjium's data? A question for a lawyer, only worth asking if we want their extra coverage.

## Method

Rerun with the scripts in [`pitch-accent-source/`](pitch-accent-source/). Run them from a work directory holding the downloads below. Versions used: fugashi 1.5.2, pyopenjtalk 0.4.1 (dictionary `open_jtalk_dic_utf_8-1.11`), unidic-lite 1.0.8 (UniDic 2.1.2), unidic-cwj-202512, Python 3.12.

1. Download `kaikki.org-dictionary-Japanese.jsonl` (saved as `ja.jsonl`) from https://kaikki.org/dictionary/Japanese/ , `JMdict_e.gz` from http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz (fetched 2026-11-05), and `unidic-cwj-202512.zip` from NINJAL (unzipped to `cwj/`).
2. `python fetch_reference.py`: picks 800 random headwords (seed 25) that have a Tōkyō accent category and fetches their wikitext from the Wiktionary API. 769 had a parsable `acc=`, giving 831 readings.
3. `python evaluate.py cwj`: for each reading, uses UniDic's first `aType` if the headword is one token with matching kana. Otherwise it uses Open JTalk's accent if Open JTalk reads the headword as one accent phrase with matching kana. A value counts as right if it is one of Wiktionary's accents for that reading.
4. `python jmdict_coverage.py cwj`: counts JMdict entries whose first form is one UniDic token with matching first reading and an accent, plus entries with a Wiktionary accent.

Limits: Wiktionary is a reference, not ground truth. Homographs where it and UniDic pick different senses count as misses. The sample is random Wiktionary entries, so it includes rare words. The "common" rows show the vocabulary Learners meet first.
