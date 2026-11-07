# content-approval

The supervisor opens the Content Approval queue under `/admin/content-approval` and the spot-checks under `/admin/content-approval/spot-checks`: every unresolved entry with its reason, whether it is operational (goes straight to the supervisor) or content (the reviewer agent decides), filters by reason and lane, and a Resolve button. Spot-checks show a running error rate and pause per content kind, the samples waiting for a verdict, and a re-review form. Behind it, the `content.review` job tokenises a drafted Example or Japanese Explanation with Sudachi, runs the automatic checks, asks the reviewer agent for per-criterion verdicts, records Approval Decisions (approve, reject, escalate) and, on a reject or failed check, sends the feedback back to the generator as `content.generate`.

## Sub-features

- Queue screen: entries with reason and lane, filter by reason and lane, Resolve.
- `GET /api/content-approval/queue` (`?reason=`, `?lane=supervisor|reviewer`, `?generationRunId=`, `?importRunId=`) and `POST /api/content-approval/queue/:id/resolve`, supervisor only.
- `content.review` job: Sudachi tokens stored on the Sentence, automatic checks, reviewer verdicts, Approval Decisions, retry through `content.generate` (3 attempts, then `generation failed`).
- Rubrics: `slices/content-approval/rubrics/<kind>/v<N>.md`, newest version wins.
- Japanese Explanation rubric (`rubrics/explanation`, criteria accurate, natural, level, distinct, reference): the reviewer prompt lists the target's ja Wiktionary explanation(s) (an approved, live explanation of the same target whose Provenance is an import from `wiktionary-ja`) under "ja Wiktionary reference", or `none`. The decision's rubric version reads `explanation/v1`.
- Proposals rubric (`rubrics/proposals/v1.md`): criteria `one-meaning`, `variant-only`, `sense-fit`, `best-candidate`, `no-match`, `reason` for merge and sense-alignment proposals. It judges meaning, not form (ように "so that" vs "like"). Check with `pnpm exec vitest run slices/content-approval/rubrics/proposals`; it is not yet wired into `content.review`, which has no proposal draft type.
- Dialogue rubric (`rubrics/dialogue/v1.md`): criteria `spoken-register`, `speaker-turns`, `audio-only`, `questions`, `target-grammar`, `length` for a listening dialogue (男/女, 2 questions of different 聴解 task types) judged as one unit with its Sentences. Check with `pnpm exec vitest run slices/content-approval/rubrics/dialogue`; not yet wired into `content.review`, which has no dialogue draft type.
- Practice Text rubric (`rubrics/practice-text/v1.md`): criteria `natural`, `translation`, `level`, `type`, `topic`, `coherent`, `questions`, `safe` for a Learner's generated reading passage or dialogue, judged against the chosen kind, passage or 聴解 task type, length and topic. Check with `pnpm exec vitest run slices/content-approval/rubrics/practice-text`; not yet wired into `content.review`, which has no Practice Text draft type.
- Example rubric is `example/v2` (answer data spelled out: accepted answer matches the span, alternates carry nudges, known-wrong answers carry explanations). The first 20 reviewer approvals after the bump are all sampled (`calibration`); a review decision records `rubricVersion: example/v2`.
- Reading Passage rubric (`rubrics/reading-passage/v1.md`): criteria `natural`, `translations`, `passage-type`, `consistency`, `level` for a Batch Text's passage; the automatic checks (items, Known words, length) stay outside it. Check with `pnpm exec vitest run slices/content-approval/rubrics/reading-passage`; it is not yet wired into `content.review`, which has no Reading Passage draft type.
- Spot-checks screen: one card per kind (Examples, Japanese Explanations, Listening Clips) with error rate over the last 50 sampled, "auto-approval paused" and Resume; sample cards with Looks right / Reject and a note; re-review form (Generation Run, Rubric version or Model).
- `GET /api/content-approval/sampling/spot-checks` (`?status=pending|confirmed|rejected`), `POST .../spot-checks/:id/verdict` `{verdict: confirm|reject, note?}`, `POST .../kinds/:kind/resume`, `POST .../re-reviews` `{generationRunId?|rubricVersion?|model?}`, supervisor only.
- Sampling: every reviewer approval is drawn in `content.review`: all of the first 20 after a model or rubric version change (`calibration`), else 5% (`random`). Listening Clip audio approvals (derived decisions whose process starts `listening`) are drawn the same way when the spot-checks list is loaded. State is in `content_approval.sample` and `content_approval.kind_state`.
- A rejected sample takes its unit down: Retired if any Learner has a Review of the Example (or its Study Item), else Rejected; a Retired Example opens a Generation Request `example retired`.
- Pause: more than 10% rejected among the last 50 settled `calibration`/`random` samples of a kind pauses it. While paused the reviewer's approvals stay `draft` and show as `held` samples; Approve makes them live, Reject sends the feedback back to the generator. Resume starts a fresh window.
- Refresh-flag review: `reviewRefreshFlags` in `slices/content-approval/rubrics/refresh` judges open `stale override`, `orphaned override`, `example redrafted`, `superseded`, `unmatched sense` and `level disagreement` entries against one rubric each (`rubrics/refresh/<reason-with-dashes>/v<N>.md`). Approve keeps a stale override (active) or approves the redrafted Example as a unit; reject retires an override (never deletes it) or rejects the draft. An approved `orphaned override` and a rejected `level disagreement` always escalate: the reviewer never moves an override and never writes a Level Candidate. Each decided entry is resolved. Not yet wired to a job or screen; proved by Vitest (`rubrics/refresh/refresh.test.ts`) against fakes.
- Not built here: the budget alert, reviewer wiring for rubrics other than Example and Japanese Explanation.

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

## Spot-checks

Preconditions: the baseline stack and a Supervisor. Samples only exist once a reviewer has approved something, which needs the review job (Sudachi and an LLM key). Without them, insert approved rows and `content_graph.approval_decision` rows with `psql` and say so in the evidence; Listening Clip samples come from a decision whose `decider` is `{"kind":"derived","process":"listening/voicevox","version":"1"}`.

- **Sample appears.** After the reviewer approves a draft, `psql -c "select kind, reason, status from content_approval.sample order by at"` shows a `calibration` row; open `/admin/content-approval/spot-checks` and the card shows the Sentence, its translation and the reviewer's model and rubric.
- **Reject live content.** Type a note, click Reject. The card leaves the list; `select approval, retired from content_graph.example where id = '<id>'` says `rejected, f` for an Example no Learner has met and `approved, t` for one with a Review in `progress.reviews`; the latter also has an `example retired` row in `content_graph.generation_request`.
- **Pause.** Reject enough drawn samples that more than 10% of the last 50 are rejected. The Examples card says "auto-approval paused" with a Resume button. Run another review: the draft stays `draft` and a `held` card appears. Approve makes it live; Resume clears the pause.
- **Re-review.** Enter a model name in the form and click Queue re-review: "N queued." and `re-review` cards appear for live approvals by that model that have no open sample.
- **Learner is refused.** The spot-checks API answers 403 to a Learner and 401 without a cookie.

## Gotchas

- `level disagreement` entries come from the derived-level process in core `content-graph/levels`, not from this slice: one per Study Item whose approved List candidate differs from its current level, with `detail` `{list, current}`. Resolving one does not re-queue it.
- `verify.sh up` starts neither Sudachi nor an LLM, so the review job cannot run end to end there; the queue screens and API can.
- The queue API builds its session check from `AUTH_SECRET` and `APP_URL`; without them the first request answers 500.
- Operational reasons are `breaker tripped`, `budget exhausted`, `generation failed`, `staleness alarm`. The reviewer agent never handles them.
- An escalated draft stays `draft`; only the primary record (the Example or explanation) is queued.
- The generator's reading of an Example is its accepted answer's reading; a disagreement with Sudachi is shown to the reviewer and never fails the draft.
- Held and re-review samples are chosen, not drawn, so they never count towards the error rate. Neither does a verdict from before the last Resume.
- A single rejected sample in a brand-new kind is 100% of the sampled items, so it pauses the kind at once; the 10% rule has no minimum sample size.
- Listening Clip sampling relies on content-generation recording clip audio approval as a derived Approval Decision whose process starts `listening`. Until it does, the Listening Clips card stays empty.
