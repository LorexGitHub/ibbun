# Content Graph schema

Decided in [#12](https://github.com/LorexGitHub/mojibun/issues/12). Terms follow [CONTEXT.md](../CONTEXT.md). This document fixes the *shape* of the graph. Field-level detail for Grammar Points is in #20, answer data on Examples in #18, and import and refresh mechanics in the import pipeline ticket.

## Principles

- **Facts only, no order.** The graph holds stable facts about Japanese. Anything about sequence, unlocking or prerequisites belongs to the Learning Path (#3, #15), even when it looks like a fact.
- **Shared and the same for everyone.** Learner-written content (own Sentences, notes) never lives in the graph. It lives in the Learner's data and points into the graph.
- **Every record has** a mojibun-owned ID, Provenance, an approval state (`draft` → `approved` | `rejected`) and a retired flag. Learners see only approved, non-retired records. Nothing is hard-deleted ([ADR 0001](adr/0001-own-ids-and-override-layer.md)).

## Storage shape

A hybrid layout:

- One shared `study_item` table: id, type (`kanji` | `word` | `grammar_point` | `listening_clip`), JLPT Level reference, approval state, retired flag, Provenance.
- One detail table per Study Item type.
- `sentence` and `reading_passage` are separate tables, outside `study_item`.
- Typed link tables, one per link type.
- A `source_key` mapping table: (dataset, upstream key) → mojibun ID.
- An `override` table: (record, field, value, Provenance), applied on top of the imported data.

## Nodes

| Node | Study Item? | Source | Holds |
|---|---|---|---|
| **Kanji** | yes | KANJIDIC2 (all ~13k) | readings, meanings, grade, frequency, KRADFILE components and KanjiVG strokes as plain data (no component nodes) |
| **Word** | yes | JMdict (all ~219k entries) | one entry: written forms, readings, senses (English glosses plus a **Japanese Explanation** per sense), priority tags. **Pitch accent** per reading: the field exists but stays empty until a licensed source is approved (see the pitch accent ticket) |
| **Grammar Point** | yes | hanabira draft, then Content Approval (#20) | English meaning, **Japanese Explanation**; other fields in #20 |
| **Listening Clip** | yes | VOICEVOX TTS (#5, #11) | audio file reference, voice (for credit) |
| **Sentence** | no | Tatoeba (arrives `draft`), generated | Japanese text, one English translation (more languages later), token list with readings from Sudachi (rebuilt when the text changes; reading fixes go in as overrides) |
| **Reading Passage** | no | authored or generated | title, ordered Sentences |

Kanji and Listening Clips have no Japanese Explanation.

## Links

| Link | Carries | Origin |
|---|---|---|
| Word **contains** Kanji | position in the written form | derived |
| Sentence **uses** Word | form, reading, sense, character span | Tatoeba `jpn_indices`, or derived by Sudachi |
| Sentence **demonstrates** Grammar Point | character span | generated (draft → approval) |
| Listening Clip **voices** Sentence | order | derived |
| Reading Passage **contains** Sentence | order | authored |
| Grammar Point **relates to** Grammar Point | kind (see also, contrast) | authored or generated |

There are no prerequisite or ordering links.

**Derived links** come from a deterministic process. Their Provenance says "derived by process X, version Y". They arrive `approved` and are rebuilt whenever their inputs change. Links produced by a model or a pattern match arrive `draft` and go through Content Approval.

## Example

An **Example** is its own record: a Sentence, the Study Item it reviews (any type), and the target span to blank out. It has its own approval state. Answer data (accepted answers, alternates, known wrong answers, hints) hangs off the Example and is designed in #18. Most Sentences that use a Word are *not* Examples of it.

An Example can only be approved if its Sentence has an English translation **and** its target has a Japanese Explanation. This is needed because a Learner may turn off either one (#18).

## JLPT Level

- Each Study Item has **one** current JLPT Level, or is **Unlevelled**. It is stored as an assignment with its own Provenance, so re-tagging never touches the item. #22 decides which source wins.
- Only Study Items with a level are offered by default. Unlevelled ones (most JMdict Words, non-JLPT Grammar Points) are studied only when a Learner picks Unlevelled in the level filter.
- Sentences, Reading Passages and Listening Clips have **computed** levels: the highest level among the Words and Grammar Points they link to. This also implements the #4 check that a Sentence's vocabulary is at or below its level.

## Provenance

Provenance is on every node, link, level assignment and override. It holds:

- the source: a dataset and version or import run, `derived` with process and version, or `generated` with model and run
- the licence
- credit data: author (Tatoeba username, VOICEVOX voice) and source URL

Provenance is internal. #19 decides which credits are shown and where. The schema carries everything a credit might need, so #19 needs no migration.
