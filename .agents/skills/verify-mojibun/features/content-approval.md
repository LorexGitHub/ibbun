# content-approval

The supervisor opens the Content Approval queue under `/admin/content-approval`: every unresolved entry with its reason, whether it is operational (goes straight to the supervisor) or content (the reviewer agent decides), filters by reason and lane, and a Resolve button. Behind it, the `content.review` job tokenises a drafted Example or Japanese Explanation with Sudachi, runs the automatic checks, asks the reviewer agent for per-criterion verdicts, records Approval Decisions (approve, reject, escalate) and, on a reject or failed check, sends the feedback back to the generator as `content.generate`.

## Sub-features

- Queue screen: entries with reason and lane, filter by reason and lane, Resolve.
- `GET /api/content-approval/queue` (`?reason=`, `?lane=supervisor|reviewer`, `?generationRunId=`, `?importRunId=`) and `POST /api/content-approval/queue/:id/resolve`, supervisor only.
- `content.review` job: Sudachi tokens stored on the Sentence, automatic checks, reviewer verdicts, Approval Decisions, retry through `content.generate` (3 attempts, then `generation failed`).
- Rubrics: `slices/content-approval/rubrics/<kind>/v<N>.md`, newest version wins.
- Not built here: spot-check sampling, error rates, pause and resume, the budget alert, rubrics for kinds other than Example and Japanese Explanation.

## How to get to it (user POV)

1. Log in as a Supervisor (a Learner account granted the role with `pnpm --filter @mojibun/learner grant-supervisor <email>`).
2. Open the "Approval" link in the nav, or go to `/admin/content-approval`.
3. A Learner who opens the same URL sees "Supervisors only." and no entries.

## Driving it with Playwright

Preconditions: the baseline stack; a Supervisor and a Learner exist (account slice); queue rows exist. Create them with the real paths where possible: a Generation Request that fails 3 attempts gives `generation failed`. Where no screen creates a row yet, insert it with `psql` into `content_graph.queue_entry` and say so in the evidence.

- **Supervisor sees the queue.** Log in as the Supervisor, click the "Approval" nav link. Expect a heading "Content Approval queue" and one card per unresolved entry, each with its reason pill.
- **Lane shown.** A `generation failed` or `budget exhausted` card says "operational: goes straight to the supervisor"; an `escalated` card says "content: the reviewer agent decides, the supervisor samples".
- **Filter.** Choose Reason `escalated`: only escalated cards remain. Choose Lane `supervisor`: only operational ones. Read-only second view: `curl` the API with the session cookie and compare ids.
- **Resolve.** Click Resolve on a card. It leaves the list; reload and it is still gone; `psql -c "select resolved from content_graph.queue_entry where id = '<id>'"` says `t`.
- **Learner is refused.** Log in as the Learner, open `/admin/content-approval`: the screen says "Supervisors only."; `curl` of the queue API with the Learner cookie answers 403, and without a cookie 401.
- **Review job (needs Sudachi and an LLM key, otherwise skip and say so).** Enqueue `content.review` for a Generation Run that wrote a draft Example; afterwards `select outcome, decider from content_graph.approval_decision order by at` shows the decision, `content_graph.sentence.tokens` is filled, and a rejection enqueues `content.generate` with `feedback`. The Vitest suite in `slices/content-approval` proves this against fakes; a live run proves the wiring.

## Gotchas

- `level disagreement` entries come from the derived-level process in core `content-graph/levels`, not from this slice: one per Study Item whose approved List candidate differs from its current level, with `detail` `{list, current}`. Resolving one does not re-queue it.
- `verify.sh up` starts neither Sudachi nor an LLM, so the review job cannot run end to end there; the queue screens and API can.
- The queue API builds its session check from `AUTH_SECRET` and `APP_URL`; without them the first request answers 500.
- Operational reasons are `breaker tripped`, `budget exhausted`, `generation failed`, `staleness alarm`. The reviewer agent never handles them.
- An escalated draft stays `draft`; only the primary record (the Example or explanation) is queued.
- The generator's reading of an Example is its accepted answer's reading; a disagreement with Sudachi is shown to the reviewer and never fails the draft.
