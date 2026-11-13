# Open Japanese datasets: coverage, formats, licences

Research for ticket #8. Question: which open datasets can seed the **Content Graph** (Kanji, Words, Grammar Points, Sentences, Listening Clips, and the typed links between them), what each one requires of us, and what we must author or generate ourselves.

Researched 2026-10-30/31. Counts marked "measured" come from files downloaded on those dates. Anything not confirmed from a primary source is marked **(unconfirmed)**. This is not legal advice. The licence questions in the last section need a lawyer's sign-off before launch.

## Summary table

| Dataset | Covers | Format | Size | Cadence | Licence | Obligations |
|---|---|---|---|---|---|---|
| **JMdict** (EDRDG) | Words: readings, glosses, POS, priority tags (news/ichi/spec/gai/nf). No JLPT Level. | XML (DTD); JSON via jmdict-simplified | 218,963 entries; 22,649 flagged "common" (measured, jmdict-simplified 3.6.2, 2026-10-26) | Generated daily | EDRDG Licence = CC BY-SA 4.0 + extra terms | **User-visible acknowledgement on each screen** that displays its words (web). ShareAlike. **Web servers must update at least monthly.** Commercial use allowed. |
| **JMdict_e_examp** | JMdict plus example Sentences from the Tanaka Corpus, linked per sense | XML; JSON (`jmdict-examples-eng`) | 28,929 entries carry examples (measured) | Daily, as JMdict | EDRDG (dictionary) + CC BY (sentences) | Both sets of terms apply. |
| **KANJIDIC2** (EDRDG) | Kanji: readings, meanings, school grade, newspaper frequency rank (top 2,501), **old JLPT level 1–4**, stroke count, radicals, dictionary indices | XML (DTD); JSON | 13,108 kanji in full file (EDRDG); 10,384 in jmdict-simplified `kanjidic2-en` (measured) | Rolling (database version 2026-299 in latest build) | EDRDG Licence (CC BY-SA 4.0 + extras). SKIP, Four Corner, Pinyin keep their own rights but are distributed under the same terms. | As JMdict. |
| **RADKFILE/KRADFILE** | Kanji → component mapping | Text; JSON | ~13k kanji | Rolling | EDRDG Licence | As JMdict. |
| **KanjiVG** | Kanji stroke shapes, stroke order, stroke types, component and radical groups | SVG per character; one XML file | 6,703 files in `main` release (measured); release `r20260714` | Irregular (latest release 2026-07-14) | CC BY-SA 3.0, © Ulrich Apel | Attribution, ShareAlike. |
| **Tatoeba** (sentences) | Japanese Sentences with translations; link graph between translations; tags; user lists; reviews | TSV/CSV exports | 249,225 Japanese sentences (stats page); 2,048,467 English | Weekly (Saturday 06:30 UTC) | CC BY 2.0 FR (a few sentences CC0) | **Credit the author of each sentence**. No ShareAlike. |
| **Tatoeba `jpn_indices`** (former Tanaka "B lines") | Sentence uses Word links: each Japanese sentence tokenised to JMdict headwords, with readings, inflected form and sense number | TSV: sentence id, meaning id, index text | 150,075 sentences (measured) | Weekly | CC BY 2.0 FR | As Tatoeba. |
| **Tatoeba audio** | Human recordings of Japanese Sentences | MP3 + CSV of sentence id, audio id, user, licence, attribution URL | 6,420 Japanese clips: 5,111 with no licence (Tatoeba-only), 1,282 CC BY-NC 4.0, **27 CC BY 4.0** (measured) | Weekly | Per clip | Most clips are **unusable** for us. See Listening Clips below. |
| **Tanos JLPT lists** (Jonathan Waller) | Unofficial JLPT N5–N1 vocab and kanji lists; grammar lists also published on the site | Spreadsheets/PDF/Anki on tanos.co.uk | ~8k words across N5–N1 **(unconfirmed, site unreachable)** | Not maintained (made "over a decade ago") | CC BY (version unconfirmed) | Attribution to Jonathan Waller. Whether CC BY also covers the grammar lists is **unconfirmed**. |
| **yomitan-jlpt-vocab** (stephenmk) | Waller's vocab lists **mapped to JMdict entry IDs**, with spelling fixes | Yomitan dictionary zip (JSON) | Waller's lists | Occasional | CC BY-SA 4.0 | Attribution, ShareAlike. |
| **open-anki-jlpt-decks** | Waller-derived vocab decks, edited | CSV → apkg | — | Occasional | MIT for the repo (but data originates from CC BY Tanos) | Credit Waller as upstream. |
| **hanabira.org-japanese-content** | **Grammar Points N5–N1** with title, short and long explanation, formation, example Sentences (jp/romaji/en) | JSON + Markdown | 828 grammar points: N5 136, N4 124, N3 132, N2 191, N1 245 (measured) | Active (last push 2026-09-24) | CC BY 4.0 | Attribution **with a link to https://hanabira.org**. No ShareAlike. |
| **Tae Kim's Guide to Learning Japanese** | Grammar explanations (not JLPT-tagged) | HTML/PDF | ~one book | Static | CC BY-NC-SA (version unconfirmed) | **NonCommercial**. Avoid it if ibbun might ever charge. |
| **Kanjium** | Pitch accent for 124,137 words; kanji data | SQLite + text | — | Last push 2026-10-03 | CC BY-SA 4.0 for "everything*" | Attribution, ShareAlike. Upstream origin of the pitch data is **unclear**. |
| **BCCWJ word frequency list** (NINJAL) | Word frequency in a 104M-word balanced written corpus | Zipped TSV | — | Static | "Free for use for research or educational purposes". No open licence. | **Commercial use unclear.** Ask NINJAL. |
| **FrequencyWords** (hermitdave) | Frequency lists from OpenSubtitles | Text | — | Static (2016/2018) | CC BY-SA 4.0 (content), MIT (code) | Attribution, ShareAlike. Japanese tokenisation quality unverified. |
| **JMdict priority tags** | Built-in frequency proxy (news1/2, ichi1/2, spec1/2, gai1/2, nf01–48) | Part of JMdict | — | Daily | EDRDG | As JMdict. |

## Per dataset

### JMdict and JMdict_e_examp
- What it is: "a multilingual lexical database with Japanese as the pivot language". The source database is held in PostgreSQL and "the JMdict and EDICT versions are generated and released daily". Sources: https://www.edrdg.org/jmdict/j_jmdict.html, https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html
- No JLPT Level field. Frequency comes only from priority tags. nfxx ranks Mainichi Shimbun frequency in 500-word bands.
- `JMdict_e_examp.gz` is "the above JMdict file with example sentence pairs from the Tanaka_Corpus". Since June 2021, about 31,400 sentences have been attached to about 28,700 entries (https://www.edrdg.org/wiki/Tanaka_Corpus.html). We measured 28,929 entries with examples. This gives ready-made **Sentence uses Word** links at sense level.
- Easiest consumption: jmdict-simplified (https://github.com/scriptin/jmdict-simplified). Prebuilt JSON is released automatically every Monday. Data stays under EDRDG / CC BY-SA 4.0. The npm packages are MIT. The examples build "doesn't have full support". Release 3.6.2 asset sizes: `jmdict-eng` 11.5 MB tgz (118 MB JSON), `jmdict-eng-common` 1.4 MB, `jmdict-examples-eng` 14.2 MB, `kanjidic2-en` 1.3 MB.

### EDRDG licence (JMdict, KANJIDIC2, RADKFILE/KRADFILE)
Source: https://www.edrdg.org/edrdg/licence.html
- Base licence is CC BY-SA 4.0. Commercial use: "There is NO restriction placed on commercial use of the files."
- Extra conditions that go beyond plain CC BY-SA:
  - **Web display:** "If a WWW server is providing a dictionary function or an on-screen display of words from the files, the acknowledgement must be made on each screen display." (A footer line is the usual practice. Jisho, for example, does this.)
  - Software and apps: acknowledgement "in the documentation, publicity material, WWW site of the package/server". On smartphones it goes "on a separate screen accessed from a menu, such as one labelled 'About', 'Sources'".
  - **Freshness:** "WWW-based dictionary servers should update their dictionary versions at least once a month. Failure to keep the versions up-to-date is a violation of the licence." Whether a study app counts as a "dictionary server" is **(unconfirmed)**. The cautious reading is that it does, which forces a monthly re-import.
  - Share-alike: modified works "may be distribute[d] only under the same, similar or a compatible licence".
- The licence page includes sample attribution text (`#attribution` anchor).

### KANJIDIC2
Source: https://www.edrdg.org/wiki/KANJIDIC_Project.html
- 13,108 kanji from JIS X 0208, 0212 and 0213. XML/UTF-8.
- `jlpt` field: "The pre-2010 level of the Japanese Language Proficiency Test (JLPT) in which the kanji occurs (1-4)." The page notes that there are no official kanji lists for N1–N5.
- Measured distribution in the 2026-10-26 build: old level 4 = 103, 3 = 181, 2 = 739, 1 = 1,207 (2,230 total).
- **Mapping old levels to N5–N1 (community practice, not official; unconfirmed as any standard):** 4 → N5, 3 → N4, 1 → N1. Old level 2 must be split between N3 and N2, and nothing in KANJIDIC2 supports that split. The new N3 sits between the old 3 and 2. Most apps use Waller's kanji lists for N5–N1 instead of deriving levels from this field.
- `grade` (G1–G6 kyōiku, G8 jōyō, G9–G10 jinmeiyō) and `freq` (top 2,501 from Mainichi Shimbun) are useful ordering signals for the **Learning Path**.

### KanjiVG
Sources: https://github.com/KanjiVG/kanjivg, https://kanjivg.tagaini.net/
- One SVG per character with stroke paths, stroke order, stroke types and component/radical groups. Can drive stroke-order animation and **Word contains Kanji** decomposition.
- "KanjiVG is copyright © 2009-2026 Ulrich Apel. It is released under the Creative Commons Attribution-Share Alike 3.0 license."
- Latest release is `r20260714`. It ships `main` (6,703 files), `all` (with variants) and `stripped` zips, plus a single XML file.

### Tatoeba and the Tanaka Corpus
Sources: https://tatoeba.org/en/terms_of_use, https://tatoeba.org/en/downloads, https://www.edrdg.org/wiki/Tanaka_Corpus.html
- Sentence text is CC BY 2.0 FR: "it is your responsibility to quote the author of the sentence". The detailed export includes the username per sentence. There is **no ShareAlike**.
- Tanaka Corpus: about 212k student-produced pairs, edited down to just over 150k. It was absorbed into Tatoeba in 2006 and moved to CC BY in 2009. EDRDG warns that it "cannot be regarded as containing natural or representative examples of text" (transcription errors, unnatural translations). These Sentences will need **Content Approval**-style filtering before use.
- `jpn_indices` is "the equivalent of the 'B lines' in the Tanaka Corpus file distributed by Jim Breen". Each line has a sentence id, a meaning id and an index string. Example: `直ぐに{すぐに} 諦める{諦めて} 昼寝 を 為る(する){する} かも知れない`. Each token gives the JMdict headword, `(reading)`, `[sense#]` and `{surface form}`. A trailing `~` marks a checked token. This is the best open source of **Sentence uses Word** links: 150,075 sentences.
- Updated weekly, every Saturday at 06:30 UTC.
- No Sentence is tagged with a Grammar Point or a JLPT Level.

### Tatoeba audio (human Listening Clips)
- Export fields: sentence id, audio id, username, licence, attribution URL. "Empty license fields indicate audio restricted to Tatoeba use only."
- Japanese, measured 2026-10-24: **6,420 clips**. 5,111 have no licence (Tatoeba-only, so we may not use them), 1,282 are CC BY-NC 4.0 (NonCommercial), and **27 are CC BY 4.0**. Contributors are concentrated: `CVjpn1` alone has 4,111 clips, apparently imported from Common Voice **(unconfirmed)**.
- Conclusion: human audio is negligible for a possibly-commercial app. TTS remains the plan for **Listening Clips**.

### JLPT word and kanji lists (Tanos / Jonathan Waller and derivatives)
- The JLPT has published no official lists since 2010. JLPT FAQ (https://www.jlpt.jp/e/faq/index.html): it decided against publishing "Test Content Specifications". Every N5–N1 tag in the wild is therefore an estimate. Most trace back to Waller.
- tanos.co.uk was **unreachable** (DNS failure) on 2026-10-30/31, so its licence page could not be read first-hand. Secondary but consistent statements:
  - "The data is licensed as CC-BY by Jonathan Waller." (https://git.pvv.ntnu.no/oysteikt/tanos-japanese-word-books/raw/branch/main/README.md)
  - yomitan-jlpt-vocab says the lists were created "over a decade ago" and are distributed under CC BY. It notes "Official vocabulary lists do not exist for the JLPT". (https://github.com/stephenmk/yomitan-jlpt-vocab)
  - hanabira cites "Creative Commons BY" with a link to tanos.co.uk.
  - CC BY version, and whether it covers Waller's **grammar** lists, are **unconfirmed**.
- **yomitan-jlpt-vocab** (CC BY-SA 4.0) has already mapped Waller's words to **JMdict entry IDs**. That is the hard join, but using it adds a ShareAlike layer. The alternative is to redo the mapping ourselves from Waller's CC BY lists.
- **open-anki-jlpt-decks** (https://github.com/jamsinclair/open-anki-jlpt-decks) is MIT, via chyyran/jlpt-anki-decks, from tanos. The MIT label does not remove the upstream CC BY credit obligation.
- Jisho shows JLPT tags. Their origin is the Waller lists **(unconfirmed, no primary statement found)**. Jisho does not offer a bulk data licence, so it is not a source.

### Grammar Points
- **No authoritative open list exists.** There is no official list (see JLPT FAQ above).
- **hanabira.org-japanese-content** (https://github.com/tristcoil/hanabira.org-japanese-content) is the only sizeable, permissively licensed, JLPT-tagged set found:
  - Licence: "Creative Commons Attribution 4.0 International (CC BY 4.0). When using this content, you must provide attribution and include a link to https://hanabira.org."
  - Contents: 828 points, each with title, short and long explanation, formation, and example sentences with romaji and English.
  - Caveats:
    - The changelog says the content went through "proofreadings", but its authorship is undocumented. The style suggests machine generation **(unconfirmed)**.
    - The level assignments are hanabira's own.
    - The app code repo (https://github.com/tristcoil/hanabira.org) is MIT. Some third-party summaries claim AGPL, but the repo LICENSE file is MIT.
  - Treat it as a candidate seed list that must pass Content Approval, not as ground truth.
- **Tae Kim's Guide**: CC BY-NC-SA. NonCommercial is incompatible with a paid product. It is also not organised by JLPT.
- **Tanos grammar lists**: exist per level. Licence coverage is **unconfirmed** (site down).
- **Wikipedia/Wiktionary**: CC BY-SA 4.0. Wiktionary has entries for particles and some grammatical suffixes, but no JLPT-graded grammar inventory.
- No other CC-licensed, JLPT-tagged grammar dataset was found.

### Frequency
- JMdict priority tags and KANJIDIC2 `freq` are free signals under licences we already accept.
- BCCWJ frequency list (https://clrd.ninjal.ac.jp/bccwj/en/freq-list.html) is "free for use for research or educational purposes". It has no open licence, and commercial use is **unclear**. Do not ingest it without written permission from NINJAL.
- FrequencyWords (https://github.com/hermitdave/FrequencyWords) is OpenSubtitles-based, CC BY-SA 4.0. We did not verify that Japanese is included or how well it is tokenised.

### Pitch accent
- Kanjium (https://github.com/mifunetoshiro/kanjium): "Everything* in this package is licensed under the Creative Commons Attribution-ShareAlike 4.0 International license". Pitch data for 124,137 words sits in `accents.txt`, credited to "Uros O."
- The ultimate source of that pitch data is not documented. Pitch accent dictionaries such as NHK's are commercial, so its provenance is a risk **(unconfirmed)**.

## Gaps

1. **Grammar Points.** There is no official inventory and no high-trust open one. Hanabira (CC BY 4.0) is the only usable JLPT-tagged set, and its quality and authorship are unknown. Explanations, formation rules and level assignment need to be authored or generated, then pass Content Approval.
2. **Sentence demonstrates Grammar Point links.** No dataset provides them. Tatoeba has no grammar tags. Hanabira's examples are attached to its own points only. These links must be generated, for example by pattern matching on morphological analysis and then review.
3. **JLPT Level for Words and Kanji.** Every source is unofficial and goes back to Waller's lists, roughly ten years old. KANJIDIC2 holds only the old 4-level scale. Words outside Waller's lists (most of JMdict) have no level.
4. **Sentence quality and level.** Tatoeba/Tanaka Sentences are not graded by JLPT Level, and EDRDG warns they are unnatural in places. Reading Passages do not exist in any open form.
5. **Listening Clips.** Only 27 Japanese Tatoeba clips are under a licence we can use commercially. TTS is required.
6. **Commercially clean frequency.** BCCWJ terms are unclear. The open alternatives are ShareAlike or newspaper-biased.
7. **Pitch accent** has uncertain upstream provenance.

## Implications for ibbun

### Attribution conflicts with hidden Provenance
The CONTEXT.md decision ("Provenance … recorded internally, never shown to a Learner") **cannot hold as stated** if we use these datasets:
- **EDRDG (JMdict/KANJIDIC2/RADKFILE)** requires acknowledgement **on each screen** that displays words from the files on a website. This is the strictest obligation. A site-wide footer line ("This site uses the JMdict/EDICT and KANJIDIC dictionary files…") is the established way to comply.
- **Tatoeba CC BY 2.0 FR** requires crediting the **author of each sentence**. Per-sentence credit is the safe reading. A credits page listing contributors may be "reasonable to the medium" under CC BY 2.0 §4b, but that is **unconfirmed**.
- **Hanabira CC BY 4.0** requires attribution plus a link to hanabira.org.
- **KanjiVG, Kanjium, yomitan-jlpt-vocab (CC BY-SA)** and **Waller (CC BY)** need attribution, which can sit on a credits/About page. CC BY 4.0 §3(a)(2) allows attribution "in any reasonable manner", including a linked page. KanjiVG's 3.0 licence is similar.

Suggested reconciliation for the supervisor: keep **Provenance** as the internal per-record field. Separately, add a **user-visible credits mechanism**: a global footer for EDRDG, a credits page for the rest, and per-Sentence author credit (or at least a link) for Tatoeba. The CONTEXT.md wording would then change to something like "Provenance is internal; licence attribution is shown where a licence requires it."

### ShareAlike (CC BY-SA 4.0 for EDRDG, Kanjium, yomitan-jlpt-vocab; BY-SA 3.0 for KanjiVG)
- **Displaying content counts as sharing.** CC BY-SA 4.0 defines "Share" to include making material available to the public by any means, which covers showing it in a web app. Material we adapt (for example JMdict entries we edit, merge or re-gloss) and then show must itself be offered under BY-SA (or a compatible licence). Learners would be free to copy it.
- **Our derived database.** CC 4.0 licences cover sui generis database rights (§4). If we extract a substantial part of JMdict into our Postgres tables, those tables are Adapted Material whenever we Share them. We are not required to publish a dump. But we may not add terms or technical measures that stop people reusing the BY-SA content we display (§2(a)(5)(C), no downstream restrictions). Our terms of service must not claim exclusive rights over it.
- **Generated content.** Content we write or generate independently (our own Grammar Point explanations, generated Sentences, TTS audio) is not Adapted Material if it does not adapt BY-SA content. We can license it however we like, and it can sit next to BY-SA data as a Collection. Where it is derived from BY-SA material (for example an LLM rewrite of JMdict glosses, or a Sentence edited from a CC BY-SA source), it inherits BY-SA. Keeping Provenance per record makes this boundary auditable. That is a strong reason to keep the field even though it is hidden.
- **Closed-source app.** Yes. The licences apply to the data, not to our TypeScript code. jmdict-simplified's npm packages are MIT. The only ShareAlike code is jmdict-simplified's own repo source (CC BY-SA 4.0), and we only need its released data. AGPL does not apply (hanabira's code is MIT and we would not use it anyway).
- **NonCommercial sources must be excluded** if ibbun may ever charge: Tae Kim's Guide, CC BY-NC Tatoeba audio, and BCCWJ (unclear).

### Operational obligations
- **Monthly refresh** of EDRDG data (licence condition for web dictionary servers). jmdict-simplified's weekly releases make an automated monthly re-import easy. Plan for entry IDs changing and being merged.
- Weekly Tatoeba exports allow re-sync of sentence corrections and author attribution.

### What we must generate or hand-author
- **Grammar Points**: the inventory (seed from hanabira, cross-checked against Tanos lists if their licence is confirmed), explanations, formation, and JLPT Level. This is the largest content gap.
- **Sentence demonstrates Grammar Point** links, all of them.
- **JLPT Levels** for Words and Kanji not covered by Waller, and a decision on how to map KANJIDIC2's old level 2.
- **Graded Sentences and Reading Passages** at each JLPT Level, since Tatoeba Sentences are ungraded and of uneven quality.
- **Listening Clips** via TTS.

### Recommended seed set (lowest licence friction)
JMdict + KANJIDIC2 + RADKFILE/KRADFILE (via jmdict-simplified), KanjiVG, Tatoeba sentences + `jpn_indices`, Waller JLPT vocab/kanji (CC BY; re-map to JMdict IDs ourselves, or accept yomitan-jlpt-vocab's BY-SA), hanabira grammar (CC BY 4.0) as a draft list for Content Approval. Skip Tae Kim, Tatoeba audio, BCCWJ and Kanjium until the open questions are resolved.

## Sources
- EDRDG licence: https://www.edrdg.org/edrdg/licence.html
- JMdict: https://www.edrdg.org/jmdict/j_jmdict.html, https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html
- KANJIDIC2: https://www.edrdg.org/wiki/KANJIDIC_Project.html
- Tanaka Corpus: https://www.edrdg.org/wiki/Tanaka_Corpus.html
- jmdict-simplified: https://github.com/scriptin/jmdict-simplified (release 3.6.2+20261026175559)
- KanjiVG: https://github.com/KanjiVG/kanjivg, https://kanjivg.tagaini.net/
- Tatoeba: https://tatoeba.org/en/terms_of_use, https://tatoeba.org/en/downloads, https://tatoeba.org/en/stats/sentences_by_language, exports at https://downloads.tatoeba.org/exports/
- JLPT FAQ: https://www.jlpt.jp/e/faq/index.html
- Tanos (unreachable during research): https://www.tanos.co.uk/jlpt/
- yomitan-jlpt-vocab: https://github.com/stephenmk/yomitan-jlpt-vocab
- open-anki-jlpt-decks: https://github.com/jamsinclair/open-anki-jlpt-decks
- tanos-japanese-word-books: https://git.pvv.ntnu.no/oysteikt/tanos-japanese-word-books
- hanabira: https://github.com/tristcoil/hanabira.org, https://github.com/tristcoil/hanabira.org-japanese-content
- Tae Kim: https://guidetojapanese.org/learn/ (licence confirmed only via search snippets; **unconfirmed** first-hand)
- Kanjium: https://github.com/mifunetoshiro/kanjium
- BCCWJ frequency list: https://clrd.ninjal.ac.jp/bccwj/en/freq-list.html
- FrequencyWords: https://github.com/hermitdave/FrequencyWords
- CC BY-SA 4.0 legal code: https://creativecommons.org/licenses/by-sa/4.0/legalcode
