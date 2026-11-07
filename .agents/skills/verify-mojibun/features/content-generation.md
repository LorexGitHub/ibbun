# content-generation

Admin slice with no screens yet. It is the `content.generate` and `batch-text.generate` job handlers in `apps/worker`; the journeys below drive it through the queue and read the result from Postgres.

## Sub-features

- **Example Sentences** for a Word, a levelled Kanji or a Grammar Point (`kinds/example-sentence/`): Draft Sentence, Example and accepted answer with `generated` Provenance.
- **Batch Texts** (`kinds/reading-passage/`): `batch-text.generate` opens a Generation Request (`kind = batch-text`, target = a passage id derived from Learner and batch, `reason` carries the batch) and enqueues `content.generate`. The attempt writes a Draft Reading Passage (prose, Sentences linked in order) and the Learner's Batch Text record in `progress.texts`. The prompt carries the earlier items (weakest first), a target length that grows with the level's progress, the rotated passage type, and the cast and episode summary of the last episode at that level.
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

Preconditions: Postgres from Compose with migrations applied; an approved Word with a form and a level.

## Gotchas

- A retry of a Batch Text rewrites the same passage id: the rejected attempt's links are retired. The Batch Text record is written once, with the first attempt, so its cast and summary come from that attempt.
- Earlier items are ordered by Mastery, then soonest due; `progress` does not expose stability.
- A paused request is not retried by the queue. `resumePaused()` re-enqueues open requests whose pool has budget again; nothing calls it on a schedule yet.
- Drafts have no tokens until `content-approval` runs Sudachi, and the generator's whole-Sentence reading is not stored, so reading check 2 compares only the target's reading (kept as the accepted answer).
- The budget counts Generation Runs, so reviewer calls count only once `content-approval` records them as runs.
