# Content Graph schema

Decided in [#12](https://github.com/LorexGitHub/mojibun/issues/12). Terms follow [CONTEXT.md](../CONTEXT.md). This document fixes the *shape* of the graph. Field-level detail for Grammar Points is in [grammar-points.md](grammar-points.md) (#20), answer data on Examples in #18, and import and refresh mechanics in [import-pipeline.md](import-pipeline.md) (#23).

## Principles

- **Facts only, no order.** The graph holds stable facts about Japanese. Anything about sequence, unlocking or prerequisites belongs to the Learning Path (#3, #15), even when it looks like a fact.
- **Shared and the same for everyone.** Learner-written content (own Sentences, notes) never lives in the graph. It lives in the Learner's data and points into the graph.
- **Every record has** a mojibun-owned ID, Provenance, an approval state (`draft` → `approved` | `rejected`) and a retired flag. Learners see only approved, non-retired records. Nothing is hard-deleted ([ADR 0002](adr/0002-own-ids-and-override-layer.md)), except derived links, which are a rebuildable cache ([ADR 0004](adr/0004-owned-sub-entry-ids-and-derived-links-as-cache.md)).

## Storage shape

A hybrid layout:

- One shared `study_item` table: id, type (`kanji` | `word` | `grammar_point` | `listening_clip`), approval state, retired flag, Provenance.
- A `level_candidate` table: (Study Item, level, kind `editorial` | `list` | `derived`, approval state, retired flag, Provenance). The current JLPT Level is a derived view over it ([jlpt-levels.md](jlpt-levels.md)).
- One detail table per Study Item type.
- `sentence` and `reading_passage` are separate tables, outside `study_item`.
- Typed link tables, one per link type.
- A `source_key` mapping table: (dataset, upstream key) → mojibun ID.
- mojibun IDs *inside* a Word too: each written form, reading and sense has its own ID, kept across refreshes ([ADR 0004](adr/0004-owned-sub-entry-ids-and-derived-links-as-cache.md)). Pitch accent, Japanese Explanations, Sentence uses Word links and overrides point at these IDs, never at positions.
- An `override` table: (record, field, value, based-on upstream value, state `active` | `stale` | `orphaned`, Provenance), applied on top of the imported data.
- An `import_run` table: dataset, upstream version, checksum, status, counts. Import Provenance points at it.

## Nodes

| Node | Study Item? | Source | Holds |
|---|---|---|---|
| **Kanji** | yes | KANJIDIC2 (all ~13k) | readings, meanings, grade, frequency, KRADFILE components and KanjiVG strokes as plain data (no component nodes) |
| **Word** | yes | JMdict (all ~219k entries) | one entry: written forms, readings, senses (English glosses plus a **Japanese Explanation** per sense), priority tags. **Pitch accent** per reading: the field exists but stays empty until a licensed source is approved (see the pitch accent ticket) |
| **Grammar Point** | yes | hanabira and Tanos, merged and seeded once, then Content Approval ([grammar-points.md](grammar-points.md)) | title, forms, formation, register, English meaning, **Japanese Explanation**, notes, Matcher Rule |
| **Listening Clip** | yes | VOICEVOX TTS (#5, #11); dialogues generated ([listening.md](listening.md)) | kind (`sentence` \| `dialogue`), audio key per line |
| **Sentence** | no | Tatoeba (arrives `draft`), generated | Japanese text, one English translation (more languages later), token list with readings from Sudachi (rebuilt when the text changes; reading fixes go in as overrides), **Sentence Audio** key and voice ([listening.md](listening.md)) |
| **Reading Passage** | no | authored or generated | title, ordered Sentences, form (`prose` \| `dialogue`), comprehension questions (dialogue form only, [listening.md](listening.md#practice-texts)) |

Kanji and Listening Clips have no Japanese Explanation.

## Links

| Link | Carries | Origin |
|---|---|---|
| Word **contains** Kanji | position in the written form | derived |
| Sentence **uses** Word | form, reading, sense, character span | Tatoeba `jpn_indices`, or derived by Sudachi |
| Sentence **demonstrates** Grammar Point | character span | hanabira examples, Matcher Rule proposals or generated (draft → approval, [grammar-points.md](grammar-points.md)) |
| Listening Clip **voices** Sentence | order, speaker (男/女), voice | derived, or generated with the dialogue |
| Reading Passage **contains** Sentence | order | authored |
| Grammar Point **relates to** Grammar Point | kind (see also, contrast), comparison text | authored or generated |
| Retired Word **superseded by** Word | — | derived on refresh (#23) |

There are no prerequisite or ordering links.

**Derived links** come from a deterministic process. Their Provenance says "derived by process X, version Y". They arrive `approved` and are rebuilt whenever their inputs change. A rebuild replaces them; they are not retired, because nothing points at them. Links produced by a model or a pattern match arrive `draft` and go through Content Approval.

## Example

An **Example** is its own record: a Sentence, the Study Item it reviews (any type), and the target span to blank out. It has its own approval state. Answer data (accepted answers, alternates, known wrong answers, hints) hangs off the Example and is designed in #18. Most Sentences that use a Word are *not* Examples of it.

An Example can only be approved if its Sentence has an English translation **and** its target has a Japanese Explanation. This is needed because a Learner may turn off either one (#18).

A Study Item with no approved Example can't be reviewed. It is **Suspended**: not due and not offered in Learn until an Example is approved ([import-pipeline.md](import-pipeline.md#suspended-study-items)).

## JLPT Level

- Each Study Item has **one** current JLPT Level, or is **Unlevelled**. It is computed from **Level Candidates**, each with its own Provenance, ranked Editorial > List > Derived, so re-tagging never touches the item. Sources and rules are in [jlpt-levels.md](jlpt-levels.md) (#22).
- Only Study Items with a level are offered by default. Unlevelled ones (most JMdict Words, non-JLPT Grammar Points) are studied only when a Learner picks Unlevelled in the level filter.
- Sentences, Reading Passages and Listening Clips have **computed** levels: the highest level among the Words and Grammar Points they link to, ignoring Unlevelled Words. Each Sentence also stores its unlevelled Word count. This also implements the #4 check that a Sentence's vocabulary is at or below its level.

## Provenance

Provenance is on every node, link, Level Candidate and override. It holds:

- the source: a dataset and version or import run, `derived` with process and version, or `generated` with model, prompt-template version and Generation Run ([content-approval.md](content-approval.md#provenance-of-generated-content))
- the licence
- credit data: author (Tatoeba username, VOICEVOX voice) and source URL

Approval is recorded separately, as append-only Approval Decisions; a record's approval state is its latest one ([content-approval.md](content-approval.md#approval-decisions)).

Provenance is internal. #19 decides which credits are shown and where. The schema carries everything a credit might need, so #19 needs no migration.
