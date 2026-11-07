# content-generation

Admin slice with no screens yet. It is a `content.generate` job handler in `apps/worker`; the journeys below drive it through the queue and read the result from Postgres.

## Sub-features

- **Example Sentences** for a Word, a levelled Kanji or a Grammar Point (`kinds/example-sentence/`): Draft Sentence, Example and accepted answer with `generated` Provenance.
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

Preconditions: Postgres from Compose with migrations applied; an approved Word with a form and a level.

## Gotchas

- A paused request is not retried by the queue. `resumePaused()` re-enqueues open requests whose pool has budget again; nothing calls it on a schedule yet.
- Drafts have no tokens until `content-approval` runs Sudachi, and the generator's whole-Sentence reading is not stored, so reading check 2 compares only the target's reading (kept as the accepted answer).
- The budget counts Generation Runs, so reviewer calls count only once `content-approval` records them as runs.
