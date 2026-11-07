# content-generation

Admin slice with no screens yet. It is the `content.generate` and `batch-text.generate` job handlers in `apps/worker`; the journeys below drive it through the queue and read the result from Postgres.

## Sub-features

- **Example Sentences** for a Word, a levelled Kanji or a Grammar Point (`kinds/example-sentence/`): Draft Sentence, Example and accepted answer with `generated` Provenance.
- **Japanese Explanations** for a Word sense ja Wiktionary doesn't cover, or a Grammar Point (`kinds/explanation/`): a Draft `japanese_explanation` with `generated` Provenance. A matching ja Wiktionary entry goes into the prompt as reference and into the Provenance `inputs`.
- **Batch Texts** (`kinds/reading-passage/`): `batch-text.generate` opens a Generation Request (`kind = batch-text`, target = a passage id derived from Learner and batch, `reason` carries the batch) and enqueues `content.generate`. The attempt writes a Draft Reading Passage (prose, Sentences linked in order) and the Learner's Batch Text record in `progress.texts`. The prompt carries the earlier items (weakest first), a target length that grows with the level's progress, the rotated passage type, and the cast and episode summary of the last episode at that level.
- **Merge proposals** (`kinds/proposals/merge.ts`, kind `merge_proposal`): target is a hanabira Grammar Point (`source_key.dataset = 'hanabira'`); candidates are the Grammar Points keyed `tanos`. Writes a `merge proposal` queue entry, no record.
- **Sense-alignment proposals** (`kinds/proposals/alignment.ts`, kind `sense_alignment`): target is an approved Word; its draft Japanese Explanations keyed `wiktionary-ja` are aligned to its JMdict senses. Writes one `sense alignment` queue entry per gloss.
- **Batch Texts** (`kinds/reading-passage/`): `batch-text.generate` opens a Generation Request (`kind = batch-text`, target = a passage id derived from Learner and batch, `reason` carries the batch) and enqueues `content.generate`. The attempt writes a Draft Reading Passage (prose, Sentences linked in order) and the Learner's Batch Text record in `progress.texts`. The prompt carries the earlier items (weakest first), a target length that grows with the level's progress, the rotated passage type, and the cast and episode summary of the last episode at that level.
- **Merge proposals** (`kinds/proposals/merge.ts`, kind `merge_proposal`): target is a hanabira Grammar Point (`source_key.dataset = 'hanabira'`); candidates are the Grammar Points keyed `tanos`. Writes a `merge proposal` queue entry, no record.
- **Sense-alignment proposals** (`kinds/proposals/alignment.ts`, kind `sense_alignment`): target is an approved Word; its draft Japanese Explanations keyed `wiktionary-ja` are aligned to its JMdict senses. Writes one `sense alignment` queue entry per gloss.
- **Grammar Point fields and Matcher Rule** (`kinds/grammar-fields/`, request `kind = 'grammar-fields'`): updates the draft point's `grammar_point` row in place (title, forms, formation, register, meaning, `matcher_rule`; `notes` is left alone) and adds `generated` Provenance. The point stays `draft`. A rule that misses any of the point's own tokenised example Sentences is refused as an invalid answer, so the attempt is spent and the model sees why.
- **Generation Runs**: one per LLM call (model, template version, inputs, tokens, cost), including calls that gave no usable answer.
- **Attempts**: 3 per Generation Request, then `generation failed` in the queue.
- **Daily token budget**: Batch Texts at most 50%, the rest for everything else; a spent pool pauses its work and queues `budget exhausted` naming the pool.

## How to get to it (user POV)

There is no Learner or admin screen. The supervisor sees its effects in the Content Approval queue (`generation failed`, `budget exhausted`) once `content-approval` exists. Until then, check the tables.

## Driving it with Playwright

Nothing to drive in a browser yet. Journey (API and database only):

1. Start the stack (`verify-mojibun` launch). Set `ANTHROPIC_API_KEY`, or stub the LLM; `DAILY_TOKEN_BUDGET` defaults to 2,000,000.
2. Open a request: insert a `content_graph.generation_request` row with `kind = 'examples'`, `status = 'open'`, `attempts = 0` for an approved Word, then enqueue `content.generate` with `{ "requestId": "<id>" }`.
3. Expect: a `generation_run` row for the request with tokens and cost; draft `sentence`, `example` and `example_answer` rows whose `provenance.source.kind = 'generated'` and `generationRunId` is that run; the request `in review`; a `content.review` job queued.
4. Budget: set `DAILY_TOKEN_BUDGET=100`, repeat. The second request stays `open` with 0 attempts and one unresolved `queue_entry` with reason `budget exhausted` and `detail.pool = 'general'`.

5. Batch Text: enqueue `batch-text.generate` with `{ learnerId, level: "N5", itemIds: [<approved Word id>] }`. Expect: a `batch-text` request `in review` with one Generation Run; a draft `reading_passage` (id = the request's `target_id`) with draft `sentence` rows linked by `passage_contains_sentence`; one `progress.texts` row (`kind = batch`, `episode = 1`, `detail` holding the cast and summary); a `content.review` job. Enqueue it again: nothing changes. Enqueue a second batch: `episode = 2`, and the prompt (Generation Run `inputs`) has the first episode's summary.
6. Proposals: open a `merge_proposal` request for a draft hanabira Grammar Point (with at least one `tanos` Grammar Point), or a `sense_alignment` request for a Word with draft `wiktionary-ja` explanations. Expect unresolved `queue_entry` rows with reason `merge proposal` / `sense alignment`, `generation_run_id` set, `detail` holding the proposed match and a reason, and the request `in review`. `content.review` fails until the proposals rubric (#88) exists.

7. Explanations: insert a request with `kind = 'explanation'` for an approved `word_sense` id (or a Grammar Point study item id) and enqueue `content.generate`. Expect a draft `japanese_explanation` row (`word_sense_id` or `grammar_point_id` set) with `generated` Provenance. A sense that already has a non-rejected explanation uses its 3 attempts and lands in the queue as `generation failed`. For a Grammar Point with a `wiktionary-ja` explanation, the draft's Provenance `inputs` contain that explanation's id and the Generation Run `inputs` contain its text.
5. Grammar fields: for a `draft` Grammar Point with an empty `meaning`, insert a request with `kind = 'grammar-fields'` and enqueue `content.generate`. Expect the `grammar_point` row filled, `matcher_rule` a `{ "pattern": [...] }` object, the study item still `draft`, the request `in review`. With example Sentences that have tokens, the stored rule matches each of them.

Preconditions: Postgres from Compose with migrations applied; an approved Word with a form and a level.

## Gotchas

- A retry of a Batch Text rewrites the same passage id: the rejected attempt's links are retired. The Batch Text record is written once, with the first attempt, so its cast and summary come from that attempt.
- Earlier items are ordered by Mastery, then soonest due; `progress` does not expose stability.
- A paused request is not retried by the queue. `resumePaused()` re-enqueues open requests whose pool has budget again; nothing calls it on a schedule yet.
- Grammar fields have no reviewer rubric yet (`content-approval` has none for `grammar-fields`); `content.review` will throw for these requests until that slice adds one.
- Drafts have no tokens until `content-approval` runs Sudachi, and the generator's whole-Sentence reading is not stored, so reading check 2 compares only the target's reading (kept as the accepted answer).
- The budget counts Generation Runs, so reviewer calls count only once `content-approval` records them as runs.
