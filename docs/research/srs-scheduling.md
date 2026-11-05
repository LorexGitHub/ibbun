# SRS scheduling: fixed ladder vs FSRS

Researched 2026-11-05 for issue #10. Sources are official docs, specs, source code and first-party repos. Bunpro facts come from `docs/research/bunpro-behaviour.md` §1 and are not re-verified here. "Benchmark" means the README of https://github.com/open-spaced-repetition/srs-benchmark. "ts-fsrs docs" means https://open-spaced-repetition.github.io/ts-fsrs/.

## Summary

- **Fixed ladders are simple and easy to explain.** WaniKani has 9 stages with intervals from 4 hours to about 4 months, and it drops items by a published formula. Bunpro has 12 levels from 4 hours to 6 months. Both name their stages, and both treat the top stage as done.
- **FSRS models memory instead of following a ladder.** Each item has a stability, a difficulty and a recall probability. The app schedules the next review for when recall is expected to fall to a target, 90% by default. FSRS-6 has 21 weights. FSRS-7 has 34 weights and handles same-day reviews. Anki has shipped FSRS as an opt-in since 23.10 and added FSRS-6 in 25.07.
- **On the benchmark, FSRS predicts recall much better than SM-2 or fixed schedules.** On about 10k Anki users, FSRS-6 scores log loss 0.346 against 0.72 for SM-2 (unweighted). Even FSRS with default weights beats every SM-2 variant. Fixed Leitner-style ladders are not in the benchmark. Duolingo's HLR paper used them only as baselines.
- **Pass/fail grading costs FSRS very little.** The benchmark variant "FSRS-6 binary" treats Hard and Easy as Good. It scored 0.351 against 0.345 for full grades. Typed cloze answers map cleanly to Again/Good.
- **ts-fsrs is the clear TS choice.** It is MIT licensed, has 853 stars, and was last pushed 2026-11-04. But v6.0.0 came out on 2026-10-28 with large breaking changes, FSRS-7 as the default, and a Node ≥24 requirement. The v5 line (5.4.2, Node ≥20, no dependencies) is the stable fallback. Personal weight training needs `@open-spaced-repetition/binding`, which is marked beta.
- **Personal weights need data.** In fsrs-rs, under 8 training items gives default weights. Under 64 gives defaults plus fitted initial stability only. Anki warns that "less than a few hundred" reviews can give poor results.
- **Mastery is easy to define with a ladder and needs a rule we invent with FSRS.** The closest precedent is Anki's "mature" (interval ≥21 days). Bunpro's FSRS mode simply hides its level UI. A stability threshold mapped to named bands is a workable rule, but it is our invention.
- **Swapping is cheap if the Review log is the source of truth.** Both approaches can be rebuilt from an append-only log of (item, time, outcome). ts-fsrs ships `Reschedule.replay()` for exactly this, so a ladder → FSRS move later is a data migration, not a rewrite.

---

## 1. Fixed ladders: WaniKani and Bunpro

**WaniKani stages.** Assignments have `srs_stage` 0–9. The default system has unlocking at 0, starting at 1, passing at 5 and burning at 9. `passed_at` is set when an item first reaches stage 5, and `burned_at` when it first reaches stage 9 (https://docs.api.wanikani.com/20170710/#spaced-repetition-systems, #assignments). The knowledge base names them Apprentice 1–4, Guru 1–2, Master, Enlightened and Burned. Burned items stop appearing in reviews (https://knowledge.wanikani.com/wanikani/srs-stages/).

**WaniKani intervals.** The API's example system gives stage intervals in seconds: 14400, 28800, 82800, 169200, 601200, 1206000, 2588400 and 10364400. That is 4h, 8h, 23h, 47h, about 7d, 14d, 30d and 120d. The interval is "adjusted to the beginning of the hour", which is why it is 23h and not 24h. An "accelerated" system differs only in stages 1–4 (2h, 4h, 8h, 23h) (https://docs.api.wanikani.com/20170710/#spaced-repetition-systems). The knowledge base says levels 1 and 2 use the faster Apprentice intervals (https://knowledge.wanikani.com/wanikani/srs-stages/). The stage ladder is data in the API (a `stages` array of `{interval, interval_unit, position}`), not hard-coded logic. That is a useful pattern to copy.

**WaniKani demotion.** `new_srs_stage = current_srs_stage - (incorrect_adjustment_count * srs_penalty_factor)`. The adjustment count "is the number of incorrect times you have answered divided by two and rounded up". The penalty factor "is 2 if the `current_srs_stage` is at or above 5. Otherwise it is 1" (https://knowledge.wanikani.com/wanikani/srs-stages/). A review records `incorrect_meaning_answers`, `incorrect_reading_answers` and `ending_srs_stage` (https://docs.api.wanikani.com/20170710/#reviews). The API says WaniKani no longer stores review data, and the reviews endpoints are deprecated (same page). **Unconfirmed:** the floor stage after demotion. The formula does not state it, and the API says `ending_srs_stage` runs 1–9.

**Bunpro** (from `bunpro-behaviour.md` §1). Levels 0–12 with 11 intervals: 4h, 8h, 24h, 2d, 4d, 8d, 2w, 1mo (or 4w), 2mo (or 8w), 4mo and 6mo. A wrong answer drops 1 level by default. Users can choose −2, −3, half or full reset. Ghost reviews are per-sentence extras on a separate 4h/12h/24h/48h ladder and do not change the parent level. Master (12) means no more reviews unless "Master+" is on. An opt-in "FSRS Flashcard" mode exists and hides the level UI.

**What a ladder needs per item:** the stage (an integer), the due time and, for Bunpro-style ghosts, a per-sentence ghost stage. There are no per-user weights.

## 2. FSRS

**Model.** FSRS is a DSR model (Difficulty, Stability, Retrievability) that grew out of MaiMemo's DHP model. Retrievability R is the probability of recall. Stability S is "the interval when R=90%". Difficulty D is in [1, 10]. Grades are 1 Again, 2 Hard, 3 Good and 4 Easy (https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm). In FSRS-6 the forgetting curve is `R(t,S) = (1 + factor·t/S)^(−w20)`, with the decay w20 trainable per user. It has 21 parameters and its own formula for same-day reviews (same page).

**Versions as of today.** The benchmark lists FSRS v4 ("the first version that was integrated into Anki"), FSRS-5 (uses same-day reviews for training), FSRS-6 (trainable curve flatness) and FSRS-7. FSRS-7 is described as "the newest version… designed to work with fractional interval lengths" and "the only version that can give realistic predictions of probability of recall for same-day reviews" (benchmark README, "Algorithms"). FSRS-7 has 34 weights and two stability traces, `stability` (slow) and `stabilityFast` (https://open-spaced-repetition.github.io/ts-fsrs/guide/model/fsrs-7.md). In FSRS-7, unlike FSRS-6, neither stability is the 90% interval (same page). That makes FSRS-7 stability harder to show to a Learner.

**Inputs.** For each review FSRS needs only the grade and the actual review time. Elapsed time comes from timestamps. ts-fsrs v6 removed the stored `elapsed_days` and says to "derive elapsed time from actual review timestamps" (ts-fsrs v6.0.0 release notes, https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/v6.0.0).

**Desired retention.** This is the target recall at the due date. Anki's default is 90%, "which offers a good balance of retention and workload" (https://docs.ankiweb.net/deck-options.html, FSRS section). ts-fsrs exposes it as `desiredRetention` and also supports per-grade retention and a "Cost ADR" policy (v6.0.0 release notes).

**Optimizer.** Default weights work out of the box. Training per user fits weights to that user's review log. In fsrs-rs, under 8 training items returns the default weights. Under 64 (`MIN_ITEMS_TO_TRAIN`) returns the defaults with only the initial-stability weights fitted. That is FSRS-6. For FSRS-7, "FSRS-7 has no parameter pre-training", so it gets the defaults (https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/training.rs). A training item is a card's review-history prefix, not a single review. **Unconfirmed:** the exact mapping from items to review count. Anki says the optimizer "requires several reviews" and that "less than a few hundred" can perform poorly (https://docs.ankiweb.net/deck-options.html).

**Anki adoption.** Anki 23.10: "Support for FSRS… is now integrated into Anki" (https://github.com/ankitects/anki/releases/tag/23.10). Anki 25.07: "FSRS-6 brings further algorithm improvements" (https://github.com/ankitects/anki/releases/tag/25.07). FSRS is opt-in and global in Anki's deck options (https://docs.ankiweb.net/deck-options.html). No Anki release note up to 26.09.4 (2026-11-04) mentions FSRS-7. The benchmark says that "in Anki, FSRS-7 should be shipped with both recency weighting and scheduling penalties enabled", which suggests it is planned but not shipped. **Unconfirmed:** whether FSRS-7 is in Anki.

**Grading caveat.** Anki: "FSRS can adapt to almost any habit, except for one: pressing 'Hard' instead of 'Again' when you forget". Hard "is a passing grade, not a failing grade" (https://docs.ankiweb.net/deck-options.html). This matters for any self-graded mode we offer.

## 3. Benchmark results

**Setup.** 9,999 Anki collections, about 727M reviews, with 349,923,850 used for evaluation (no same-day reviews). Splits are by time (`TimeSeriesSplit`), so models are always tested on later reviews. The metrics are log loss and RMSE (bins), which measure calibration, and AUC, which measures discrimination (benchmark README, "Dataset", "Metrics").

**Current table, without same-day reviews** (benchmark README, as of the 2026-10-24 push):

| Algorithm | Params | Log loss ↓ | RMSE (bins) ↓ | AUC ↑ |
|---|---|---|---|---|
| FSRS-7 recency | 34 | 0.3370 | 0.0593 | 0.7220 |
| FSRS-7 | 34 | 0.3401 | 0.0634 | 0.7167 |
| FSRS-6 | 21 | 0.3460 | 0.0653 | 0.7034 |
| FSRS-7 default param. | 0 | 0.3620 | 0.0910 | 0.7029 |
| AVG (constant baseline) | 0 | 0.3945 | 0.1034 | 0.4997 |
| HLR (Duolingo) | 3 | 0.4694 | 0.1275 | 0.6369 |

**SM-2.** SM-2 is not in the current README table. The README version from 2025-04-26, on the same 10k dataset, lists it (unweighted): FSRS-6 0.345 / 0.066 / 0.707, FSRS-6 binary 0.351 / 0.068 / 0.685, FSRS-6 default param. 0.371 / 0.097 / 0.701, Anki-SM-2 0.62 / 0.172 / 0.613 and SM-2 0.72 / 0.203 / 0.603 (https://github.com/open-spaced-repetition/srs-benchmark/blob/0e6c0ff5f5ca0226f9760048c3dbbc7483e0719f/README.md). The README notes that SM-2 "does not predict the probability of recall natively", so the benchmark had to add a forgetting curve to score it (same version). Result files `SM2*.jsonl` and `Anki*.jsonl` are still in `result/`.

**Fixed ladders.** No WaniKani- or Bunpro-style fixed ladder is in the benchmark. The closest evidence is Duolingo's HLR paper, which compared HLR against fixed Leitner and Pimsleur schedules as baselines (https://github.com/duolingo/halflife-regression, `experiment.py`, methods `'leitner' (fixed)` and `'pimsleur' (fixed)`; paper: Settles & Meeder, ACL 2016, http://www.aclweb.org/anthology/P16-1174). HLR itself now ranks far below FSRS on the benchmark (table above). **Unconfirmed:** any direct published comparison between a WaniKani-style ladder and FSRS.

**How to read this.** The benchmark measures how well each model predicts recall on Anki flashcard data with self-grades. It does not measure learning outcomes, and it does not cover typed cloze answers. A better-calibrated model gets the same retention with fewer reviews only to the extent that the model is right. **Unconfirmed:** how well these results carry over to typed Japanese cloze reviews.

## 4. TypeScript libraries

All data below is from `npm view` and `gh` on 2026-11-05.

| Package | Version | Licence | Last publish | Notes |
|---|---|---|---|---|
| `ts-fsrs` | 6.0.0 (latest) | MIT | 2026-10-28 | FSRS-3 to FSRS-7. Node ≥24. Depends on `@open-spaced-repetition/srs-kit@1.0.0`. Repo pushed 2026-11-04, 853 stars. |
| `ts-fsrs` | 5.4.2 | MIT | 2026-09-01 | FSRS-6 only. Node ≥20. No dependencies. `createEmptyCard` / `fsrs().repeat/next` API. |
| `@open-spaced-repetition/binding` | 0.6.0 | MIT | 2026-10-28 | Optimizer (fsrs-rs). Native in Node, WASI wasm in a browser Worker. Marked **beta**. |
| `fsrs-rs-nodejs` | 0.9.1 | MIT | 2026-08-20 | Older Node binding for fsrs-rs. |
| `femto-fsrs` | 2.0.0 | MIT | 2025-05-03 | Minimal FSRS-5. |
| `supermemo` | 2.0.23 | MIT | 2025-03-20 | SM-2. 337 stars. Repo last pushed 2025-03-28. |

No maintained npm package for a WaniKani/Bunpro-style ladder was found. A ladder is a lookup table plus a demotion rule, so it is easy to write in-house.

**ts-fsrs v6 API shape** (https://open-spaced-repetition.github.io/ts-fsrs/guide/quick-start.md, …/guide/migration.md):
- `await DefaultScheduler({ version: 'FSRS-7' | 'FSRS-6', desiredRetention, learningSteps, relearningSteps, enableFuzz, maximumInterval, weights? })`. The factory is async.
- `scheduler.newCard({ cardId, now })`, then `scheduler.review({ card, grade, now })`, which returns `{ card, revlog }` and does not mutate the input. `preview()` gives every grade's outcome. `rollback()` and `forget()` also exist.
- Card fields: `cardId`, `state`, `dueAt`, `lastReviewAt`, `stability`, `difficulty`, `stabilityFast` (FSRS-7 only), `learningStep`, `scheduledDays`, `reps`, `lapses`, `scheduleStatus` (`new` / `learning` / `review` / `suspended`).
- `Rating`: Manual 0, Again 1, Hard 2, Good 3, Easy 4. `Grade` is 1–4. `State`: New 0, Learning 1, Review 2, Relearning 3. In v6 these are frozen objects, not TS enums (https://open-spaced-repetition.github.io/ts-fsrs/api/ts-fsrs/rating-grade-state.md).
- Serialisation: cards and revlogs are plain objects with `Date` fields, plus schemas from srs-kit. Dates "require valid `Date` objects after deserialization" (migration guide). They map directly to Postgres columns or JSONB.
- `Reschedule` from `ts-fsrs/reschedule`: `replay({ history })` rebuilds the memory state from the review history without changing the due date. `reschedule()` replays the full policy (migration guide).
- Middleware: desired retention, fuzzing, learning steps, max/monotonic interval, stats, leech suspension and Cost ADR (v6.0.0 release notes).
- The legacy `fsrs()` / `FSRS` facade is still exported but deprecated, and it uses FSRS-6 (v6.0.0 release notes).

**Risk.** v6 is 8 days old, it is a major breaking release, and it pulls in a new 1.0.0 dependency. FSRS-7 card state cannot be converted from FSRS-6 state. It must be rebuilt from complete history ("Learned cards without complete history must remain on FSRS-6", v6.0.0 release notes). This argues for keeping the full Review log from day one, whatever we pick.

## 5. Fit per Study Item type

**Typed cloze for Grammar Points and Words.** This is binary: right or wrong, with no self-grade. A ladder handles it natively. FSRS takes it as Again (1) or Good (3). The benchmark's "FSRS-6 binary" variant (Hard and Easy treated as Good) lost very little accuracy against full grades (log loss 0.351 vs 0.345, §3). Binary input also avoids the Hard-as-fail misuse Anki warns about. We could later derive Hard or Easy from signals such as hints used or answer time. **Unconfirmed:** whether that helps. RWKV in the benchmark uses answer time, but FSRS does not.

**Self-graded flashcards (Kanji meaning/reading, Listening Clips, Reading review type).** FSRS uses four grades as designed. A ladder needs a mapping (Bunpro uses Hard/Good). FSRS fits better here.

**Kanji and Words with several facets** (meaning and reading). WaniKani grades both facets as one review and counts misses across them (§1). Under FSRS the choice is one memory state per item (one combined grade) or one per facet (two cards). **Unconfirmed:** which predicts better for Japanese. The benchmark has no per-facet data.

**Rotating Sentences per Grammar Point.** Bunpro keeps one level per grammar point and shows a different Sentence each review (§1). This fits one memory state per Study Item under either scheduler. The thing being remembered is the grammar point, and the Sentence is just how it is tested. Per-Sentence state would split the data thinly and delay any personal fit. The Review log should still record `sentenceId` so we can later test whether some Sentences are harder.

**Ghost reviews.** A ghost is a short, Sentence-level re-test that does not touch item state. Under a ladder it is a second mini-ladder (Bunpro: 4h/12h/24h/48h). Under FSRS the cleanest equivalent is the same: a separate per-Sentence ghost schedule outside the item's FSRS state. Ghost outcomes are logged with `kind: 'ghost'`, so they can be left out of, or added to, item replay later. FSRS-5 to FSRS-7 do use same-day reviews (§2). So adding ghosts to item state is possible, but it would change the meaning of the data. **Unconfirmed:** whether including them improves predictions.

**Session Wrap-Up re-asks.** If a Learner must re-answer missed items before a session ends, only the first answer should drive the schedule. Anki counts only "the first one" review per day for maturity (https://github.com/ankitects/anki-manual/blob/main/src/stats.md). WaniKani records one answer per item once all parts are answered (https://knowledge.wanikani.com/wanikani/srs-stages/). Log re-asks, but mark them.

## 6. Explainability to a Learner

**Ladder.** A ladder has named levels, a known next interval ("next review in 2 days"), a visible "Mastered" end state and a deterministic penalty. WaniKani publishes its formula. Bunpro exposes strictness as a setting. Learners can predict what a wrong answer will do.

**FSRS.** FSRS shows a due date, a "probability of recall" and a stability in days. Anki shows stability as "the amount of time required for the probability of recall to decrease from 100% to 90%" and retrievability as "probability of recall" (https://github.com/ankitects/anki-manual/blob/main/src/stats.md). Intervals vary by item difficulty and user weights, so two items at the "same stage" can have different next intervals. FSRS-7's two-trace stability does not have the 90% meaning (§2).

**Defining Mastery under FSRS.** No FSRS source defines "mastery". Precedents:
- Anki: a card is "mature" if its interval is ≥21 days (https://github.com/ankitects/anki-manual/blob/main/src/stats.md). It is a threshold on an output, not on the model state.
- Anki's "estimated total knowledge" is the sum of retrievability over reviewed cards (same file). It is a deck-level number, not per item.
- Bunpro's FSRS mode hides the level UI instead of mapping it (bunpro-behaviour.md §1).

A workable rule, which is **our invention**: put Mastery bands on a monotone output such as the current scheduled interval or the FSRS-6 stability (for example Beginner <1d, Adept <1w, Seasoned <1mo, Expert <4mo, Mastered ≥4–6mo). Then show "Mastered" as a label that can drop again after a lapse. The labels stay familiar to Bunpro users while FSRS sets the times. It needs a rule against flicker near a band edge, such as hysteresis or banding on stability rather than on fuzzed intervals.

**Retire or keep reviewing.** Ladders retire items (Burned, Master). FSRS has no end state, because intervals just keep growing up to `maximumInterval`. If Mastery should stop reviews, that is a product rule on top of FSRS (for example "suspend when interval ≥ N"). ts-fsrs `scheduleStatus: 'suspended'` exists for leeches (v6.0.0 release notes).

## 7. Swappability

**Common denominator: the Review log.** Both schedulers can be rebuilt from a list of `(studyItemId, reviewedAt, outcome)`:
- Ladder: fold the log through the stage table and demotion rule. This is deterministic and cheap.
- FSRS: `Reschedule.replay({ history })` rebuilds stability and difficulty, and ts-fsrs v6 says to rebuild FSRS-7 state from "complete review history since creation or the latest memory reset" (ts-fsrs v6.0.0 release notes). The optimizer also trains only from logs (§2).

So the log is the source of truth, and per-item schedule state is a derived cache.

**Proposed data model.**
- `review` (append-only): `id`, `learnerId`, `studyItemId`, `sentenceId?`, `kind` (`srs` | `ghost` | `wrapup` | `cram` | `manual`), `reviewedAt`, `outcome` (`pass` | `fail`, or a grade 1–4 for self-graded), `answerMs?`, `hintsUsed?`, `reviewType` (cloze, flashcard, listening…), `schedulerId` and `version` at write time, and `stateBefore`/`stateAfter` as JSONB for audit.
- `item_schedule` (derived, one row per learner × item): `learnerId`, `studyItemId`, `schedulerId`, `dueAt`, `state` (JSONB, opaque to everything except the scheduler), and a denormalised `masteryBand` for queries and UI.
- `ghost_schedule` (derived, per learner × sentence): `dueAt` and `ghostStep`.
- `learner_scheduler_params`: `schedulerId`, `weights?`, `desiredRetention?` and `strictness?`.

**Proposed interface** (pure, no I/O, so it is easy to test and easy for agents to work on in parallel):

```ts
interface Scheduler<S> {
  id: string;                                  // 'ladder-v1' | 'fsrs6' | 'fsrs7'
  init(now: Date): S;
  review(state: S, event: ReviewEvent, now: Date): { state: S; dueAt: Date | null };
  mastery(state: S, now: Date): MasteryBand;   // shared Learner-facing vocabulary
  stateSchema: ZodType<S>;                     // for JSONB round-trip
}
type ReviewEvent = { outcome: 'pass' | 'fail' } | { grade: 1 | 2 | 3 | 4 };
const rebuild = <S>(s: Scheduler<S>, log: ReviewEvent[], ...) => log.reduce(...)
```

`dueAt: null` means retired. A `replay(scheduler, log)` helper is just a fold, which gives migration, backfill and A/B tests for free. Wrap ts-fsrs behind this interface so its async factory and its v5→v6 churn stay in one adapter module.

**Migration from ladder to FSRS.** Replay each item's full `kind = 'srs'` history into FSRS and keep the existing `dueAt` (the ts-fsrs `replay()` default behaviour). FSRS then reschedules on the next review. This only works if the log was complete from the start. Ladder → FSRS is cheap. FSRS → ladder is also a fold. **Unconfirmed:** how well FSRS fits histories collected under ladder intervals. The benchmark data is Anki's own SM-2 and FSRS schedules.

## 8. Other options

- **SM-2** (1990). A per-item easiness factor EF on a 0–5 grade, with I(1)=1, I(2)=6 and I(n)=I(n−1)·EF (https://super-memory.com/english/ol/sm2.htm). It is self-graded by design, it does not predict recall, and it scored worst on the benchmark (§3). The `supermemo` npm package exists. There is no reason to choose it over FSRS.
- **Leitner / fixed Pimsleur.** These are the classic fixed-box schedules. They are the family the WaniKani and Bunpro ladders belong to. They appear only as baselines in the HLR paper (§3).
- **HLR** (Duolingo, Settles & Meeder 2016). A trainable half-life model that uses features (http://www.aclweb.org/anthology/P16-1174, https://github.com/duolingo/halflife-regression). It ranks below the constant AVG baseline on log loss in the current benchmark (0.469 vs 0.395). There is no maintained TS library.
- **Neural models (GRU, RWKV).** They top the benchmark (RWKV-Instant log loss 0.277) but need large pooled training data and non-SRS features (benchmark README). They do not fit an early-stage product.

## 9. Comparison table

| Criterion | Fixed ladder (WaniKani/Bunpro) | FSRS (ts-fsrs) | SM-2 |
|---|---|---|---|
| Recall prediction | Not modelled. No benchmark entry. Leitner-style only as HLR-paper baseline | Best non-neural on benchmark (FSRS-6 log loss 0.346, FSRS-7 0.340) | Worst on benchmark (0.72), needs an added curve |
| Binary typed cloze | Native | Again/Good. Small loss (FSRS-6 binary 0.351) | Needs a 0–5 mapping |
| Self-graded cards | Needs a mapping | Native 4 grades | Native 0–5 |
| Per-user adaptation | Only a global multiplier and strictness | Trainable weights (beta optimizer, needs ~hundreds of reviews) | EF per item only |
| Explainability | High: named stages, fixed intervals, published penalty | Medium: recall %, stability. Mastery bands must be invented | Medium |
| Mastery / retirement | Built in (Burned / Master) | Product rule on top | Product rule on top |
| State per item | Stage int + due | S, D (+ S_fast in FSRS-7), state, step, counters + due | EF, reps, interval + due |
| TS library | None needed (~50 LOC) | ts-fsrs 6.0.0 / 5.4.2, MIT, very active | `supermemo` 2.0.23, MIT, quiet since 2025-03 |
| Rebuild from log | Trivial fold | `Reschedule.replay()` | Trivial fold |
| Dependency risk | None | v6 just released, breaking, Node ≥24 | Low but stagnant |

## Recommendation (for the grilling ticket to decide)

**Suggestion.** Make the append-only Review log the source of truth and put scheduling behind a pure `Scheduler` interface (§7). Ship **FSRS** as the engine, via ts-fsrs behind one adapter. Use **default weights** and **binary Again/Good** for typed cloze, with desired retention 0.9. Show Learners **named Mastery bands** derived from the current interval or stability, using Bunpro-like names, so the UI reads like a ladder. Keep **ghosts** as a separate fixed per-Sentence mini-ladder that does not feed item state. If the team wants the lowest risk for v1, the fallback is a WaniKani-style data-driven ladder behind the same interface. Then switching to FSRS later is a replay of the log.

**Open questions.**
1. FSRS-6 or FSRS-7? FSRS-6 is shipped in Anki, its stability equals the 90% interval (easier bands), and ts-fsrs v5 runs on Node ≥20. FSRS-7 benchmarks slightly better and handles same-day reviews, but it is brand new in ts-fsrs and not confirmed in Anki.
2. Pin ts-fsrs 5.4.2 or adopt 6.0.0? What Node version will the Hono API run on?
3. Does Mastery retire an item (Bunpro/WaniKani) or only label it? What is the band table, and how is flicker handled?
4. One memory state per Study Item, or per facet (Kanji meaning vs reading)? Per Sentence is not recommended.
5. Do ghost and Wrap-Up answers feed item state, or are they only logged?
6. When do personal weights kick in (a review-count threshold), and do they run server-side with the native binding?
7. Should hints used or answer time ever upgrade or downgrade a binary outcome to Hard or Easy?
8. Is there a per-user strictness setting under FSRS (Bunpro has one), or is desired retention the only knob exposed?
