# Japanese NLP and TTS tooling: tokenisers, furigana, local speech synthesis

Research for ticket #11. Question: which tools can run in our Node/TypeScript stack (or as a sidecar container) to (a) tokenise and read Japanese, so we can validate generated Sentences, link them to Words and produce furigana, and (b) synthesise Listening Clip audio locally. For each tool: licence for commercial use, and any voice-credit requirement.

Researched 2026-11-03. Versions and dates come from the npm registry (`npm view`), PyPI, Docker Hub and the GitHub API on that date. Two small tests were run locally on that date (kuromoji 0.1.2 and sudachi-wasm333 1.0.4 on six sentences). Anything not confirmed from a primary source is marked **(unconfirmed)**. This is not legal advice.

## Short answer

**Tokeniser: Sudachi + SudachiDict-core, run as a small Python sidecar (SudachiPy) in the content pipeline.**
- Sudachi is the only option with all of the following: a dictionary that is still released several times a year, an Apache-2.0 licence for both code and dictionary, A/B/C split modes and a normalised form. The split modes and normalised form matter for matching tokens to JMdict Words.
- The official runtime is Rust (sudachi.rs) with Python bindings (SudachiPy). There is no official Node binding. The Node/WASM ports are one-person projects, so the sidecar is the safer choice.
- Tokenisation is a batch step: validating generated Sentences and pre-computing furigana before Content Approval. It does not need to run on the request path or in the browser, so a sidecar costs little.
- **Node-native fallback:** `lindera` (MIT, active) with its bundled SudachiDict. Lindera does **not** implement Sudachi's A/B/C split modes or input normalisation.
- **Furigana:** take the per-token reading from Sudachi. Align it to individual Kanji with **JmdictFurigana**, which is under the same CC BY-SA terms as JMdict, a licence we already accept. Add our own rules for numbers + counters, and treat every reading as something Content Approval must check. Neither tokeniser read counters correctly in our test.

**TTS: VOICEVOX ENGINE in Docker (`voicevox/voicevox_engine:cpu-*`) for Listening Clips, with voices chosen from the plain "credit and use commercially" group.**
- The engine is LGPL-3.0 and CORE is MIT.
- Every voice requires a visible credit in the form `VOICEVOX:<character>`.
- Some voices need prior approval for corporate or commercial use, and two (No.7, ユーレイちゃん) are NonCommercial by default.
- The API lets us correct reading and pitch accent per accent phrase and set speed. Learners need that.
- **Fallback:** AivisSpeech Engine (LGPL-3.0) with ACML or CC0 models needs **no credit**. However, its pitch and accent control is weaker. It also contacts AivisHub at start-up, which can update or force-remove models.
- **Excluded (NonCommercial, or no usable Japanese voice):** XTTS, Fish Speech above a USD 500k revenue threshold, Piper (its only Japanese voice is CC BY-NC-SA), COEIROINK (server use is unclear and redistribution is banned).

**Map consequence:** VOICEVOX's credit requirement is a second visible-attribution obligation, alongside EDRDG and Tatoeba from #8. It strengthens the case for a credits mechanism separate from hidden Provenance. See [Consequences for the map](#consequences-for-the-map).

## (a) Tokenisers, dictionaries and furigana

### Comparison table

| Tool | Runs as | Dictionary (licence) | Dictionary freshness | Split modes / normalisation | Code licence | Maintenance (last release) |
|---|---|---|---|---|---|---|
| **kuromoji.js** (`kuromoji`) | Pure JS in Node and browser | mecab-ipadic-2.7.0-20070801 (NAIST/ICOT licence, permissive, notice required) | **2007** | One segmentation. No normalised form. | Apache-2.0 | npm 0.1.2, **2018-03-19**. Repo last push 2023-11. Effectively unmaintained. |
| kuromoji forks (`@sglkc/kuromoji`, `@patdx/kuromoji`, `kuromoji.js`) | Pure JS | Same IPADIC | 2007 | As above | Apache-2.0 | 2023-09, 2024-11, 2025-01. Small forks (4–17 stars). |
| **kuroshiro** + `kuroshiro-analyzer-kuromoji` | JS furigana/romaji layer over an analyser | Whatever the analyser uses. The official analyser depends on `kuromoji ^0.1.2`. | 2007 via kuromoji | n/a | MIT | Revived: 1.2.1 on 2026-10-05, 2.0.0-beta.3 on 2026-10-17. The analyser's 2.0 beta still uses kuromoji 0.1.x. |
| **Sudachi** (sudachi.rs / SudachiPy) | Rust library and CLI. Python (`sudachipy`). **No official Node binding.** | **SudachiDict** small/core/full (Apache-2.0, "includes UniDic and a part of NEologd") | Release v20261015. Several per year. | **A/B/C split modes**, normalised form, dictionary form, reading | Apache-2.0 | sudachi.rs v0.7.0, 2026-09-24 (README: "v0.7.* is unstable", pin exact version). sudachipy 0.7.0 on PyPI. |
| `sudachi-wasm333` | WASM in Node and browser | Bundles a SudachiDict (header `20260116`, edition not stated). Can load others. | Depends on dict you load | A/B/C exposed | Apache-2.0 | 1.0.4, 2026-04-14. Single maintainer, 5 stars. 125 MB unpacked. |
| `sudachi` (hata6502/sudachi-wasm) | WASM | Embedded in the package | Old | A/B/C | Apache-2.0 | npm 0.1.5, 2021-08-29 |
| **Lindera** (`lindera` native N-API, `lindera-wasm`) | Native Node binding, or WASM (browser/bundler) | IPADIC (`mecab-ipadic-2.7.0-20250920`), IPADIC-NEologd, UniDic (`unidic-mecab-2.1.2`), **SudachiDict 20260723** | SudachiDict build is current. Its UniDic is old. | `normal` / `decompose`. **No Sudachi A/B/C, no Sudachi normalisation plugins.** | MIT | v6.2.0, 2026-09-26. Very active. |
| **Vibrato** | Rust. Python wrapper. WASM demo only, no npm package found. | Any MeCab-format dict (IPADIC, UniDic, …) | Depends | MeCab-style | MIT or Apache-2.0 | v0.5.3, 2026-10-25 |
| **MeCab** | C++ CLI/library. Sidecar (Debian packages) or Python `fugashi`. | IPADIC (2007), UniDic, NEologd | Depends on dict | One segmentation | GPL / LGPL / BSD (choose one) | No tagged release on GitHub. Last commit 2025-02 (web page only). Node bindings dead (`mecab-async` 2022, `@enjoyjs/node-mecab` 2022-12, `mecab-wasm` 2021). |
| **UniDic** (NINJAL) | Dictionary for MeCab/Vibrato/Lindera | GPL v2 / LGPL v2.1 / BSD (choose one) | unidic-cwj **202512** | Short-unit (SUW) words. Lemma and pronunciation fields. | n/a | 2025-12 |
| **mecab-ipadic-NEologd** | Dictionary add-on | Apache-2.0 (with Hatena and Japan Post data notices) | **Last data update 2020-09** | n/a | Apache-2.0 | Release v0.0.7, 2020-08 |
| **GiNZA** (spaCy) | Python sidecar | SudachiPy + SudachiDict, models trained on UD Japanese BCCWJ | Follows SudachiDict | Sudachi modes plus dependency parse | MIT | v5.3.0, 2026-09-30 |
| **ichiran** | Common Lisp + PostgreSQL (Docker Compose provided) | **JMdict directly** (EDRDG) | Follows JMdict | Segments directly to JMdict entries | MIT | ichiran-260118, 2026-01-18. DB about 4.7 GB. |
| **JmdictFurigana** | Data file (JSON/TXT), not a tokeniser | Built from JMdict/JMnedict | Monthly (the 25th) | Per-Kanji reading alignment for each JMdict written form | Code MIT. **Data "same licence as JMDict" (CC BY-SA).** | 2.3.1+2026-10-25 |
| `wanakana` | JS kana/romaji conversion utility | none | n/a | n/a | MIT | 5.3.1, 2023-11-20 |

### kuromoji.js and kuroshiro
- kuromoji.js is "a binary and/or source version of data from mecab-ipadic-2.7.0-20070801". The NOTICE carries the NAIST and ICOT licence: use and redistribution are permitted, but the copyright notice and disclaimer must be kept. Source: https://github.com/takuyaa/kuromoji.js/blob/master/NOTICE.md
- npm `kuromoji` latest is 0.1.2, published 2018-03-19. The repo had its last push in 2023-11 and has no releases. The forks (`@sglkc/kuromoji` 1.1.0, `@patdx/kuromoji` 1.0.4, `kuromoji.js` 0.1.6) keep the same 2007 dictionary.
- kuroshiro (https://github.com/hexenq/kuroshiro) became active again in October 2026. 1.2.1 fixed sokuon handling in furigana and okurigana. `kuroshiro-analyzer-kuromoji@2.0.0-beta.3` still depends on `kuromoji ^0.1.2` (npm registry). kuroshiro's own README for sudachi-wasm333 makes the same point: "all of them are considerably outdated" (https://github.com/Benjas333/sudachi-wasm333).
- An IPADIC from 2007 has none of the newer vocabulary, and its entries cannot be mapped cleanly to JMdict. For mojibun this matters less than reading accuracy (see the test below), but it is a reason not to build on it.

### Sudachi
- sudachi.rs is "a Rust implementation of Sudachi". The Python version (SudachiPy) now lives in the same repo, and the old SudachiPy repo is archived. Source: https://github.com/WorksApplications/sudachi.rs
- Split modes, as shown in the README: `選挙管理委員会` stays one token in mode C, and mode A gives `選挙 / 管理 / 委員 / 会`. The normalised form maps variants such as `打込む → 打ち込む`, `附属 → 付属`, `かつ丼 → カツ丼`.
- **For linking a Sentence to Words:** JMdict entries vary in size. 選挙 and 委員会 are entries, and so are compounds like 打ち合わせ. Mode C (or B) finds the longest JMdict match, and mode A can be the fallback when C produces a compound that JMdict lacks. Normalised form plus dictionary form gives a lookup key that survives okurigana variants (`打合せ` and `打ち合わせ` both normalise to `打ち合わせ` in our test).
- **Dictionary format break (October 2026):** "Dictionary binary format is changed to V1 from v202610". V1 needs sudachi.rs/SudachiPy v0.7+ (or Java Sudachi v0.8.2+). V0 binaries "will stop" being released. Pin the engine and dictionary versions together. Source: https://github.com/WorksApplications/SudachiDict
- SudachiDict licence: Apache-2.0, "This project includes UniDic and a part of NEologd". Editions: small (UniDic vocabulary only), core (default, basic vocabulary), full (adds proper nouns). Source: SudachiDict README.
- Node options:
  - `sudachi-wasm333`: Node + browser. Dynamic dictionary loading. Single maintainer.
  - `sudachi` (hata6502): 2021, dictionary embedded.
  - Neither is official. Whether `sudachi-wasm333` reads the new V1 dictionaries is **(unconfirmed)**. Its README copies sudachi.rs's v0.7 warning, which suggests it tracks v0.7.

### Lindera
- MIT. Rust core with official Node (`lindera`, N-API), WASM (`lindera-wasm`), Python, Ruby and PHP bindings. Source: https://github.com/lindera/lindera
- Prebuilt dictionaries are attached to each release, including `lindera-sudachidict-6.2.0.zip`. That bundles SudachiDict `20260723`. The `lindera-unidic` build downloads `unidic-mecab-2.1.2`, a much older UniDic than NINJAL's current 202512 (lindera `build.rs`).
- Limitation, quoted from the Lindera docs: "This dictionary reproduces SudachiDict's vocabulary and lattice behavior, but not the Sudachi engine plugins (katakana/numeric joining, input normalization, A/B/C split modes)." Source: https://github.com/lindera/lindera/blob/main/docs/src/lindera-sudachidict.md
- The SudachiDict fields still include the normalised form (field 12) and A/B split references (fields 15–16). We could rebuild A/B units in TypeScript from those references, but that means reimplementing part of Sudachi.

### MeCab, UniDic, NEologd, Vibrato
- MeCab: "released under any of the GPL, the LGPL, or the BSD License". Taking the BSD option avoids copyleft. Source: https://github.com/taku910/mecab/blob/master/mecab/COPYING. There is no maintained Node binding. Use it through a CLI or Python sidecar (`fugashi`, MIT/BSD).
- UniDic: GPL v2.0 / LGPL v2.1 / modified BSD. Latest unidic-cwj and unidic-csj are **202512**. Source: https://clrd.ninjal.ac.jp/unidic/download.html
- UniDic commercial use page: v2.x+ is free for commercial use without permission or fee. When "publishing results" users must "clearly state that UniDic was used", and they are asked to notify NINJAL when disclosing findings. Source: https://clrd.ninjal.ac.jp/unidic/commerce_use.html. Whether "publishing results" covers a product that uses UniDic internally, rather than research results, is **(unconfirmed)**. Through SudachiDict (Apache-2.0) the obligation is the Apache NOTICE.
- NEologd: Apache-2.0 with notices for Hatena keyword and Japan Post data. Last data update 2020-09. It is stale and adds little for JLPT-level text.
- Vibrato: fast MeCab-compatible Viterbi tokeniser, MIT or Apache-2.0, v0.5.3 (2026-10-25). Rust and Python only. It reads MeCab dictionaries, so it has the same dictionary trade-offs as MeCab.

### GiNZA and ichiran (sidecars)
- GiNZA: MIT. Built on spaCy + SudachiPy. It adds dependency parsing, which could later help detect **Sentence demonstrates Grammar Point** links. That link has no open dataset (#8 Gaps). Requires Python 3.10+. Source: https://github.com/megagonlabs/ginza
- ichiran: MIT. Segments text **directly to JMdict entries** (the same thing ichi.moe does), so it solves Sentence→Word linking natively. The cost is Common Lisp plus a PostgreSQL database of about 4.7 GB, built from JMdictDB. Its README ships a Docker Compose setup. Source: https://github.com/tshatrov/ichiran. It is a good **oracle for evaluation** (does Sudachi+lookup agree with ichiran on N5–N3 Sentences?) but heavy as a production dependency.

### JMdict-aware linking and per-Kanji furigana
- No mainstream tokeniser emits JMdict entry IDs, except ichiran. The usual approach is to look up (dictionary form or normalised form, reading) against the JMdict `k_ele`/`r_ele` tables we already import (#8), preferring entries with a priority tag. Ambiguous hits (same spelling, different reading or sense) go to Content Approval. Tatoeba `jpn_indices` (150k Sentences tokenised to JMdict headwords, CC BY, see #8) is a ready **gold set** for measuring our linker.
- **JmdictFurigana** (https://github.com/Doublevil/JmdictFurigana) gives a per-Kanji reading split for every JMdict written form. Example: `大人買い` → `大人/おとな` + `買/が` + `い`. Jukujikun like 大人 are kept as one ruby group. It is rebuilt on the 25th of each month.
  - Licence: the README says "distributed under the same licence as JMDict (Creative Commons Attribution-ShareAlike Licence)". The repo LICENSE file is MIT. Read this as MIT for the code and CC BY-SA for the data. That matches the EDRDG terms we already accept, so it adds no new obligation beyond credit.
  - The README warns it is "designed around individual words, not for sentences". We would apply it per token after linking.
- Tokenisers give a reading per token, not per Kanji. For a single-Kanji token, or a token whose kana parts match exactly, simple kana-diff alignment works. JmdictFurigana covers the rest.

### Furigana pitfalls (tested)
We ran six Sentences through kuromoji 0.1.2 (IPADIC) and sudachi-wasm333 1.0.4 (its bundled SudachiDict). Results:

| Input | Correct | kuromoji (IPADIC) | Sudachi (bundled dict) |
|---|---|---|---|
| 一本 | いっぽん | 一/イチ + 本/ホン ✗ | 一/イチ + 本/ポン ✗ |
| 三本 | さんぼん | 三/サン + 本/ホン ✗ | 三/サン + 本/ポン ✗ |
| 二人 | ふたり | 二/ニ + 人/ニン ✗ | 二人/フタリ ✓ |
| 一日中 | いちにちじゅう | 一/イチ + 日/ニチ + 中/チュウ ✗ (じゅう) | same ✗ |
| 大人 | おとな | ✓ | ✓ |
| 今日 | きょう | ✓ | ✓ |
| 選挙管理委員会 (mode C) | one compound | n/a | split into four even in mode C with the bundled dictionary (edition unknown) |

- **Numbers + counters** (rendaku and gemination: 一本 いっぽん, 三本 さんぼん, 六百 ろっぴゃく) are wrong in both tools. We need a counter rule table, or to treat number+counter as one unit and look the reading up. This matters a lot for N5/N4 Sentences.
- **Jukujikun and set phrases** (大人, 今日, 二人) are right when the dictionary has the whole word. They fail when the tokeniser splits the word (kuromoji on 二人).
- **Reading vs pronunciation:** IPADIC's pronunciation field uses long-vowel marks (`キノー`, `トーキョー`). Furigana must use the reading field (`キノウ`). Sudachi's `reading_form` is the reading.
- **Particles:** は/へ read as ワ/エ only in the pronunciation field. Furigana is never shown on kana, so this only affects TTS input.
- **Multiple readings of the same spelling** (e.g. 何 なに/なん, 行った いった/おこなった, 上手 じょうず/うわて) need context. The tokeniser picks one, and Content Approval must check it.
- Consequence: furigana should be **stored per Sentence** (computed, then approved), not generated live.

## (b) Local TTS for Listening Clips

### Comparison table

| Engine | Runs as | Code licence | Voice/model licence | Credit required? | Commercial use | Accent / speed control | Status |
|---|---|---|---|---|---|---|---|
| **VOICEVOX ENGINE** | Docker `voicevox/voicevox_engine:cpu-*` (about 2.1 GB, amd64 and arm64) or `nvidia-*` (about 3.7 GB). HTTP on :50021. | LGPL-3.0 (or a separate proprietary licence from Hiho) | VVM model terms + **per-character terms** | **Yes**, `VOICEVOX:<name>` | Yes for most voices. Some need prior approval or are NonCommercial (below). | **Strong:** edit `accent_phrases` (accent nucleus, moras, pitch), AquesTalk-style kana input, user dictionary with `accent_type`. `speedScale`, `pitchScale`, `intonationScale`, pauses. | Engine 0.26.0 (GitHub, 2026-10-19). Docker 0.26.1 (2026-11-03). Very active. |
| VOICEVOX CORE | Library (C API, Rust, Python, Java, Node via FFI) | MIT (for builds ≥ 0.16) | Same VVM terms | Yes | As above | Same model, lower level | 0.17.1, 2026-10-22 |
| **AivisSpeech Engine** | Docker `ghcr.io/aivis-project/aivisspeech-engine:cpu-latest`. HTTP on :10101. Largely VOICEVOX-API compatible. | LGPL-3.0 only | Per model: ACML 1.0, ACML-NC, CC0, others on AivisHub | Engine: no. ACML/CC0 models: **no**. | Yes with ACML/CC0 models | **Weak:** per-mora `pitch`, `consonant_length` and `vowel_length` are ignored. `pauseLength` is ignored. Changing `pitchScale` "may degrade quality". Has `speedScale` and `tempoDynamicsScale`. | 1.2.0, 2026-04-30. Downloads the default model and a BERT model (about 900 MB) at first start. |
| **Style-Bert-VITS2** | Python, CPU inference OK. Its own API server. | **AGPL-3.0** | Default JVNV models CC BY-SA 4.0. Amitaro models: own terms, credit required. | Depends on model | Depends on model | Style/emotion strength. Uses pyopenjtalk for accent. Limited explicit accent editing **(unconfirmed)**. | 2.7.0, 2025-08-24 |
| **Open JTalk** (HTS) via `pyopenjtalk` | C library / Python | Open JTalk modified BSD. pyopenjtalk MIT. | HTS voice "Mei": CC BY 3.0 (Nagoya Institute of Technology) | Yes (CC BY attribution) | Yes | Full-context labels allow control. Robotic quality. | pyopenjtalk 0.4.1, 2025-04 |
| **Piper** | Native / Python | Original repo MIT (**archived**). Successor `piper1-gpl` is GPL-3.0. | Only Japanese voice `ja_JP-hi_fi_captain-medium`: dataset **CC BY-NC-SA 4.0** | n/a | **No (NC)** | Speed only | piper1-gpl v1.8.0, 2026-09-04 |
| **Coqui XTTS-v2** | Python | `coqui-tts` fork MPL-2.0. Coqui itself is defunct; the original repo is "unmaintained". | **Coqui Public Model License: "only non-commercial use of a machine learning model and its outputs"** | n/a | **No** | Limited | Fork 0.28.0, 2026-10-19 |
| **Kokoro-82M** | Python (`kokoro` + `misaki[ja]`). `kokoro-js` exists, but its Japanese G2P is in Python **(unconfirmed for JS)**. | Apache-2.0 | Apache-2.0 weights. Some JP voices trained on CC BY text and flagged as such. | For CC BY-flagged voices | Yes | Speed only | Weights 2025-04. JP voices graded C- to C+ by the author. |
| **MeloTTS** (Japanese) | Python | MIT | `MeloTTS-Japanese` MIT | No | Yes | Speed only | Last release 2024-03. Repo push 2024-12. Dormant. |
| **Fish Speech / OpenAudio** | Python, GPU | **Fish Audio Community Licence** (2026-10-13) | Same | n/a | Only while annual revenue < **USD 500,000**. Written licence needed above that. Hosted TTS services banned. | Limited | Active |
| **COEIROINK** | Windows/Mac/Linux desktop app with a local API | Proprietary freeware | Per character / MYCOEIROINK | Yes, `COEIROINK:<voice>` | Yes per voice | Similar to VOICEVOX | Terms ban redistribution and running models outside the COEIROINK app. Server deployment is unclear. |
| **SHAREVOX** | Docker (VOICEVOX fork) | LGPL-3.0 | Per voice **(unconfirmed)** | **(unconfirmed)** | **(unconfirmed)** | VOICEVOX-like | Last release 0.2.1, 2023-08. Dormant. |
| Cloud (for comparison) | API | — | — | No | Yes (paid) | SSML | AWS Polly ja-JP: Mizuki, Takumi, Kazuha, Tomoko. Polly FAQ: "You can cache and replay Amazon Polly's generated speech at no additional cost." Google Cloud TTS and Azure have ja-JP voices; their caching terms were **not confirmed**. |

### VOICEVOX in detail
**Software and licences**
- Engine licence: "LGPL v3 と、ソースコードの公開が不要な別ライセンスのデュアルライセンス" (LGPL v3, or a separate licence on request from Hiho). Source: https://github.com/VOICEVOX/voicevox_engine/blob/master/LICENSE
- We would run the published image unmodified as a separate container. We do not distribute it, so LGPL creates no obligation on our TypeScript code. If we ever ship a modified engine, LGPL source obligations apply to that engine only.
- CORE: "ソースコード及びビルド成果物のライセンスは MIT LICENSE", for builds from 0.16 on. Source: https://github.com/VOICEVOX/voicevox_core

**Model and software terms**
- VVM model terms, from https://github.com/VOICEVOX/voicevox_vvm:
  - "商用・非商用問わず利用することができます" (commercial and non-commercial use allowed).
  - "作成された音声を利用する際は、各音声ライブラリの規約に従ってください" (generated audio follows each voice library's terms).
  - "作成された音声の利用を他者に許諾する際は、当該他者に対し本許諾内容の 3 及び 4 の遵守を義務付けてください". If we license the clips onward, for example a downloadable deck, our terms must pass these conditions on.
  - Prohibited: reverse engineering, acts that harm the creator or third parties, and acts against public order.
  - "ご利用の際は VOICEVOX を利用したことがわかるクレジット表記が必要です" (a credit showing VOICEVOX was used is required).
- Software terms (https://voicevox.hiroshiba.jp/term/) repeat the same points and also ban redistributing the software "無断で" (without permission).
- VOICEVOX Q&A (https://voicevox.hiroshiba.jp/qa/):
  - "VOICEVOX で作成された音声は、クレジット表記をして頂ければ商用・非商用問わず使用できます" (audio made with VOICEVOX can be used commercially or not, as long as it is credited).
  - For audio-only use: "音声の最初や最後に音声クレジットを挿入してください" (insert an audio credit at the start or end).
  - When terms differ (morphing), "より範囲の狭い（厳しい）規約が優先されます" (the narrower, stricter terms win).

**API and runtime**
- Flow: `POST /audio_query?speaker=<style_id>` returns an AudioQuery, which can be edited and then sent to `POST /synthesis`.
- AudioQuery fields: `accent_phrases`, `speedScale`, `pitchScale`, `intonationScale`, `volumeScale`, pre/post silence, `pauseLength`/`pauseLengthScale`, output rate, and a read-only `kana` field in AquesTalk-style notation.
- Accent correction: send corrected kana with `'` marking the accent nucleus to `/accent_phrases?is_kana=true` and swap the result into the query. A persistent user dictionary (`/user_dict_word` with `accent_type`) fixes recurring words.
- This fits our pipeline: store the approved kana/accent string with the Listening Clip so a re-render is reproducible. Sources: engine README and `voicevox_engine/model.py`.
- CPU and GPU images are both published. CPU is enough for batch rendering of Sentences. Throughput on Fargate CPU is **(unconfirmed)**, so measure before sizing.
- The engine finds readings with Open JTalk (pyopenjtalk). It makes the same reading mistakes as other tokenisers, so pass it the **approved reading** (kana) instead of the raw Sentence whenever the two might differ.

### VOICEVOX voices: per-character terms
Source: `TERMS.txt` in https://github.com/VOICEVOX/voicevox_vvm (48 sections, read 2026-11-03), plus the linked character pages where we could read them.

| Group | Characters | Condition |
|---|---|---|
| **Credit only, commercial OK** | 四国めたん, ずんだもん, 春日部つむぎ, 波音リツ, 玄野武宏, 白上虎太郎, 冥鳴ひまり, 九州そら, 剣崎雌雄, WhiteCUL, ちび式じい, 櫻歌ミコ, 小夜/SAYO, ナースロボ＿タイプＴ, †聖騎士 紅桜†, 雀松朱司, 麒ヶ島宗麟, 春歌ナナ, 猫使アル, 猫使ビィ, 中国うさぎ, 栗田まろん, あいえるたん, 満別花丸, 琴詠ニア, 中部つるぎ, 離途, 黒沢冴白, 東北ずん子, 東北きりたん, 東北イタコ, あんこもん, 夜語トバリ, 暁記ミタマ, 里石ユカ, ブイブイ・コバコ | "「VOICEVOX:<name>」とクレジットを記載すれば、商用・非商用で利用可能" (usable commercially or not with the credit `VOICEVOX:<name>`) |
| **Corporate use needs prior check** | 青山龍星 (ななはぴ), もち子さん (also excludes "音声作品・音声素材・ゲーム作品等"), 後鬼, Voidoll (法人: ask) | Individuals: credit only. "企業が携わる形で利用する場合は…事前確認を取る必要があります" (use involving a company needs prior confirmation). |
| **Commercial use needs inquiry** | ぞん子 | "商用利用の場合は、個別に問い合わせ…が必要" (commercial use needs an individual inquiry) |
| **NonCommercial by default** | No.7, ユーレイちゃん | "非商用（同人利用や配信による収入は OK）" (non-commercial; doujin and streaming income OK). Other commercial use needs prior confirmation. |

Character pages read first-hand:
- **東北ずん子・ずんだもんプロジェクト** (ずんだもん, 四国めたん, 九州そら, 東北 family, 中国うさぎ, 中部つるぎ, あんこもん). Source: https://zunko.jp/con_ongen_kiyaku.html
  - "利用の際にはクレジット表記が必要になります。" (credit is required)
  - "アプリなどでの利用の場合は、アプリの紹介画面などに記載をお願いします。" For an app, the credit goes on an introduction/about screen, not on every screen.
  - "クレジット表記をしない商用利用については、利用料を１キャラクター毎に４０万円（＋消費税）で契約" (commercial use without credit costs ¥400,000 + tax per character).
  - Prohibited: political or religious attack, 情報商材 (get-rich info products), deliberate false information, adult businesses, organised crime. Japanese law governs.
- **VirVox Project** (玄野武宏, 白上虎太郎, 青山龍星, 雀松朱司, 麒ヶ島宗麟, 黒沢冴白). Source: https://www.virvoxproject.com/voicevoxの利用規約
  - The credit goes "動画内、概要欄など任意の場所" (in the video, the description, or anywhere). Example given: "VOICEVOX:玄野武宏(CV:ガロ)". That is longer than the `VOICEVOX:玄野武宏` form in TERMS.txt.
  - Prohibited: "機械学習、転移学習やファインチューニング等で新たな音響モデルなどを生成すること" (creating new acoustic models by machine learning, transfer learning or fine-tuning).
- **VOICEVOX Nemo** (separate engine). Source: https://voicevox.hiroshiba.jp/nemo/term/. Credit required; "機械学習での利用" (use for machine learning) prohibited.
- 春日部つむぎ's page (https://tsumugi-official.studio.site/rule) rendered without content. Its terms are **(unconfirmed)** beyond the TERMS.txt summary.

Recommended voices: pick 2–4 from the "credit only" group, preferably from the 東北ずん子 project and VirVox. Their pages are readable and explicitly allow app credits on an about screen or anywhere. Include at least one male and one female voice for dialogue clips. Avoid every voice in the bottom three groups. Whether a voice sounds natural enough for a learner (some are very "anime") is a product call. Listen to samples before choosing.

### AivisSpeech in detail
- Engine: LGPL-3.0, inheriting VOICEVOX ENGINE's LGPL side only. FAQ: "少なくともソフトウェア本体はクレジット表記不要で、個人・法人・商用・非商用を問わず、自由にお使いいただけます" (the software itself needs no credit and is free for any use). With ACML, ACML-NC or CC0 models there is "クレジット表記の義務はありません" (no credit obligation). Source: https://github.com/Aivis-Project/AivisSpeech-Engine
- ACML 1.0 allows "すべての個人利用・法人利用・非営利利用・営利利用" (all personal, corporate, non-profit and for-profit use), except listed prohibitions (impersonation, defamation, political/religious campaigning, fraud, deceptive marketing). "クレジット表記は任意です" (credit is optional). Source: https://github.com/Aivis-Project/ACML/blob/master/ACML-1.0.md
- **ACML-NC is NonCommercial.** Choose ACML-1.0 or CC0 models only.
- Learner-relevant limits: "`consonant_length` / `vowel_length` / `pitch` フィールドはサポートされていません" (these fields are not supported), `pauseLength` is ignored, and changing `pitchScale` may degrade quality. That leaves no fine pitch-accent correction. Accent is driven by the reading text and the user dictionary.
- Operations: at start-up the engine fetches the default model list from AivisHub and applies "強制削除ルール" (forced-removal rules) that can uninstall models (`aivm_manager.py`). In production, pin models and block outbound access, or accept that risk. The default model's licence is **(unconfirmed)**.

### Other alternatives (why not)
- **Style-Bert-VITS2:** AGPL-3.0. Running it internally to render files is fine. Exposing it as a network service to Learners would trigger AGPL §13. Default JVNV models are CC BY-SA 4.0. Whether audio generated from a BY-SA model is Adapted Material is **(unconfirmed)**. Amitaro models require the credit "あみたろの声素材工房 (https://amitaro.net/)". Source: https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/TERMS_OF_USE.md
- **Open JTalk + HTS "Mei":** licences are clean (BSD + CC BY 3.0, credit "Nagoya Institute of Technology"), but the quality is clearly synthetic. Suitable for tests only.
- **Piper:** the only Japanese voice is trained on Hi-Fi-CAPTAIN, which is **CC BY-NC-SA 4.0** (`MODEL_CARD`). Excluded.
- **XTTS-v2:** the CPML licence restricts the model *and its outputs* to non-commercial use, and its URL now returns 404 (Coqui is gone). Excluded.
- **Fish Speech:** free commercial use only below USD 500k annual revenue. Above that, a written licence is required. It could work today but is a trap if mojibun grows.
- **Kokoro:** Apache-2.0 and commercially clean. The author's own grades for Japanese voices are C- to C+, there is no accent editing, and the JS port's Japanese support is **(unconfirmed)**. Worth a listening test only.
- **MeloTTS:** MIT, but dormant since 2024 and no accent editing.
- **COEIROINK:** credit `COEIROINK:<voice>`. The terms ban redistribution and "running models on non-COEIROINK engines". Only "ローカルAPI" (local API) use alongside the app is allowed. Source: https://coeiroink.com/terms. Running it headless in Docker on ECS is not clearly permitted. Excluded.
- **SHAREVOX:** dormant since 2023, and its voice terms were not checked.

## Licence obligations summary

| Component | Obligation | Visible to Learners? |
|---|---|---|
| SudachiDict / sudachi.rs | Apache-2.0: keep LICENSE/NOTICE in our distribution. Nothing visible required for a hosted service. | No |
| UniDic (inside SudachiDict) | Apache path via SudachiDict. NINJAL asks to "clearly state that UniDic was used" when publishing results. | Credits page (cautious) |
| IPADIC (if kuromoji/MeCab used) | Keep the NAIST/ICOT notice and disclaimer | No (notice file) |
| JmdictFurigana data | Same as JMdict: CC BY-SA + EDRDG terms (#8) | Already covered by the EDRDG acknowledgement |
| **VOICEVOX (software + each voice)** | **Credit `VOICEVOX:<character>` for each voice used.** For apps, the 東北ずん子 project accepts the "紹介画面" (introduction/about screen). Onward licensing must pass on the VVM conditions. No ML training on outputs (VirVox, Nemo). | **Yes** |
| AivisSpeech + ACML/CC0 model | None (credit optional). ACML text must accompany the model if we redistribute the model itself. | No |
| Open JTalk "Mei" | CC BY 3.0 attribution | Yes (credits page) |
| AWS Polly | None. Caching and replay allowed. | No |

Redistribution of generated audio: VOICEVOX allows commercial use of the audio with credit. If Learners can download clips, the per-character terms still apply to them. The VOICEVOX Q&A asks for an audio credit at the start or end of standalone audio. Whether an in-app credits page covers clips played inside the app is our reading of "アプリの紹介画面" (the app's introduction screen); for downloadable audio it is **(unconfirmed)**.

## Consequences for the map

1. **Another visible-attribution conflict with hidden Provenance.** VOICEVOX requires a visible `VOICEVOX:<name>` credit. This joins EDRDG (per-screen acknowledgement) and Tatoeba (per-author credit) from #8. The CONTEXT.md line "Provenance … never shown to a Learner" needs the same reconciliation #8 proposed: keep Provenance internal, and add a separate user-visible **credits mechanism**. For VOICEVOX a global credits/About page listing each voice used should satisfy the app-specific wording on zunko.jp ("アプリの紹介画面などに記載"). A small credit line on the Listening Clip player (e.g. "Voice: VOICEVOX:ずんだもん") is the conservative option and costs little.
2. **Listening Clip needs fields beyond the audio file:** engine + version, voice (character + style id), the approved kana/accent string used, speed, and a pointer to the credit text. This is Provenance and must not be lost, because credit obligations and re-renders depend on it.
3. **Voice selection is a licence decision.** Keep an allow-list of voices whose terms we have verified. Block NC voices (No.7, ユーレイちゃん) and approval-required voices (青山龍星, もち子さん, 後鬼, Voidoll, ぞん子) at the config level.
4. **Sidecar containers in Docker Compose:**
   - `voicevox` (`voicevox/voicevox_engine:cpu-<pinned>`, port 50021, internal network only). About 2.1 GB image.
   - `nlp` (Python: SudachiPy + SudachiDict-core, pinned together because of the V0/V1 format break, plus a thin HTTP wrapper). Optional later: GiNZA for grammar-pattern detection.
   - Both are used by the content pipeline (generation → validation → Content Approval → render). The Learner-facing API does not call them. On ECS they can be batch tasks rather than always-on services.
5. **Content Approval gains concrete checks:** level check (every linked Word at or below the Sentence's JLPT Level), unknown-token check (OOV tokens), ambiguous-reading check, counter/number reading check, and the TTS reading matching the furigana.
6. **No NonCommercial dependencies** in the recommended set. Excluded for that reason: Piper JP, XTTS, ACML-NC models, Fish Speech above the threshold, No.7, ユーレイちゃん.

## Unconfirmed

- Whether `sudachi-wasm333` reads SudachiDict **V1** (v202610+) dictionaries. Which edition its bundled dictionary is.
- Whether an **in-app credits page** satisfies every VOICEVOX character's credit requirement. zunko.jp explicitly accepts an app introduction screen and VirVox says "任意の場所" (anywhere). Other characters' pages were not read individually. 春日部つむぎ's page did not render.
- Whether downloadable Listening Clips (if offered) need an audio credit at the start or end, per the VOICEVOX Q&A.
- The VirVox credit format: TERMS.txt says `VOICEVOX:玄野武宏`, the VirVox page example says `VOICEVOX:玄野武宏(CV:ガロ)`. Use the longer form to be safe.
- VOICEVOX CPU synthesis throughput on Fargate. Not measured.
- Whether UniDic's "clearly state that UniDic was used" applies to products and not only published research.
- The licence of AivisSpeech's auto-downloaded default model.
- Whether audio generated from a CC BY-SA voice model (Style-Bert-VITS2 JVNV) is itself BY-SA.
- Japanese support in `kokoro-js` (JS); misaki's Japanese G2P is Python.
- SHAREVOX voice terms. Google Cloud TTS and Azure terms on caching generated audio (Google's Service Specific Terms page has no TTS section; the remaining 44k characters were not read).
- Style-Bert-VITS2 accent editing capability via its API.
- Sudachi mode C behaviour with SudachiDict-**core**. Our test used the bundled dictionary of sudachi-wasm333, which did not join 選挙管理委員会 in mode C. The upstream README shows it joined.
