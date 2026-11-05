# Build plan

Decided in [#40](https://github.com/LorexGitHub/mojibun/issues/40). Terms follow [CONTEXT.md](../CONTEXT.md). The slices, core modules and dependency rules are in [architecture.md](architecture.md).

This plan cuts the rebuild into issues that AI-agent engineers can each pick up on their own without colliding. The issues themselves are data in [`scripts/build-plan/issues.py`](../scripts/build-plan/issues.py). The table below is generated from it, so change the data and rerun the script; don't edit the table.

## How the work is cut

- **Wave 0 builds the whole core** before any slice: every interface the specs name, with its fake and contract tests. That keeps a dozen slice agents from adding to `content-graph` at the same time. `content-graph` is split into parallel issues that each own a subfolder: schema and reads, authoring, `applySnapshot()`, levels, `grade()`, the automatic checks, licences and Attribution, and job contracts.
- **The skeleton comes before the gates, and both come before any core code.** No core PR merges without dependency-cruiser, crapper, dryer and mutator in CI.
- **A hand-made N5 fixture graph** lets Learner slices and their Playwright specs start without waiting for the importers and Content Approval. It is mojibun-owned with Provenance `fixture`, and loads in dev and test only.
- **Big slices get a base issue, then follow-ups in their own subfolders** (`slices/import/sources/<source>/`, `slices/content-generation/kinds/<kind>/`, `slices/content-approval/rubrics/<kind>/`, and so on). The follow-ups run in parallel and never touch each other's files.
- **A generated kind is two issues:** its generator in `content-generation` and its rubric in `content-approval`, so each issue changes one slice folder.
- **Generated seeds wait for Content Approval.** The Grammar Point seed and the ja Wiktionary seed are blocked by `approval-base` and the proposals generator. Plain importers depend only on `import-base`.
- **Each issue states short acceptance criteria and links the spec section.** The docs stay authoritative. Every issue also requires the CI gates, its `verify-mojibun` feature file, and evidence from a separate verifier agent.

## Milestones

| Milestone | Delivers |
|---|---|
| **M1: first playable** | Wave 0, the fixture, `account`, `learn` and `reviews` bases, `dashboard`, `browse`. A Learner can sign up, learn an N5 batch and review it |
| **M2: real content** | Every importer and seed, `content-approval`, `content-generation` with the kinds real content needs to be approvable (Examples, answer data, Japanese Explanations, Grammar Point fields, proposals) |
| **M3: everything else** | Batch Texts, listening, Practice Texts, Wrap-Up and Ghosts, Learn now, flags, `cram`, `placement`, `credits` |

M2 includes Japanese Explanations, Grammar Point fields and proposals because an Example can't be approved without a Japanese Explanation ([review-answer-model.md](review-answer-model.md#approval-rule)), and the Grammar Point and Wiktionary seeds can't run without proposals.

## Labels and blocking

- Type: `wave-0`, `slice` or `seed`.
- Blocking uses GitHub's native **blocked by** dependencies. Each body also lists `Blocked by #n`.
- `ready-for-agent` goes only on issues with no open blocker; the rest carry `blocked`. The [`unblock` workflow](../.github/workflows/unblock.yml) swaps the labels when an issue's last blocker closes. Agents pick only `ready-for-agent` issues.
- Every issue follows [the slice issue template](../.github/ISSUE_TEMPLATE/slice.md).

## Changing the plan

Edit `scripts/build-plan/issues.py`, then:

```sh
python3 scripts/build-plan/plan.py check   # keys, blockers, cycles, milestones, spec links
python3 scripts/build-plan/plan.py render  # regenerate the table below
python3 scripts/build-plan/plan.py file    # create or update issues; idempotent by title
```

`filed.json` maps plan keys to issue numbers.

## Issues

<!-- BEGIN GENERATED -->

### M1: first playable (23 issues)

| Issue | Type | Layer | Folder | Blocked by |
|---|---|---|---|---|
| #45 Wave 0: monorepo, db, jobs, app shells and Compose | `wave-0` | 0 | `apps/*, platform/db, platform/jobs, root config` | none |
| #46 Wave 0: CI gates | `wave-0` | 1 | `.github/workflows, root config` | #45 |
| #47 Wave 0: content-graph schema, reads, fake and contract tests | `wave-0` | 2 | `core/content-graph` | #45, #46 |
| #48 Wave 0: learner accounts, sessions and roles; platform auth and mail | `wave-0` | 2 | `core/learner, platform/auth, platform/mail` | #45, #46 |
| #49 Wave 0: nlp, tts and llm adapters with fakes | `wave-0` | 2 | `platform/nlp, platform/tts, platform/llm` | #45, #46 |
| #50 Wave 0: Hum UI kit from the mock | `wave-0` | 2 | `platform/ui` | #45, #46 |
| #51 Wave 0: content-graph/authoring writes, Approval Decisions and Generation Requests | `wave-0` | 3 | `core/content-graph (authoring entry point)` | #47 |
| #52 Wave 0: the pure grade() function | `wave-0` | 3 | `core/content-graph (grade)` | #47 |
| #53 Wave 0: automatic content checks | `wave-0` | 3 | `core/content-graph (authoring/checks)` | #47 |
| #54 Wave 0: licences and Attribution | `wave-0` | 3 | `core/content-graph (licensing)` | #47 |
| #55 Wave 0: shared job contracts | `wave-0` | 3 | `core/content-graph (jobs)` | #47 |
| #56 Wave 0: progress Review log, Scheduler, Mastery and Known | `wave-0` | 3 | `core/progress` | #47 |
| #57 Wave 0: verify-mojibun skill | `wave-0` | 3 | `.agents/skills/verify-mojibun` | #45, #50 |
| #58 Wave 0: hand-made N5 fixture graph for dev and test | `wave-0` | 4 | `core/content-graph (fixtures)` | #51 |
| #59 Wave 0: applySnapshot() and the refresh rules | `wave-0` | 4 | `core/content-graph (authoring/snapshot)` | #51 |
| #60 Wave 0: Level Candidates, derived levels and computed levels | `wave-0` | 4 | `core/content-graph (levels)` | #51 |
| #61 Wave 0: Batch Text and Practice Text records, Cleared Level, furigana rule | `wave-0` | 4 | `core/progress (texts)` | #56 |
| #62 Wave 0: learning-path strategy, Tracks and seed | `wave-0` | 4 | `core/learning-path` | #47, #56 |
| #63 Slice: account | `slice` | 4 | `slices/account` | #50, #57, #48 |
| #70 Slice: learn (batch, lesson, quiz) | `slice` | 5 | `slices/learn` | #50, #57, #48, #62, #56, #52, #58 |
| #71 Slice: reviews (session) | `slice` | 5 | `slices/reviews` | #50, #57, #48, #56, #52, #58 |
| #72 Slice: dashboard | `slice` | 5 | `slices/dashboard` | #50, #57, #48, #56, #58 |
| #73 Slice: browse | `slice` | 5 | `slices/browse` | #50, #57, #48, #47, #62, #58 |

### M2: real content (23 issues)

| Issue | Type | Layer | Folder | Blocked by |
|---|---|---|---|---|
| #64 Slice: content-approval (checks, reviewer agent, queue) | `slice` | 4 | `slices/content-approval` | #50, #57, #48, #51, #53, #55, #49 |
| #65 Slice: content-generation (requests, runs, budget) and Example Sentences | `slice` | 4 | `slices/content-generation` | #50, #57, #48, #51, #55, #54, #49 |
| #74 Seed: import framework and JMdict | `seed` | 5 | `slices/import` | #50, #57, #48, #59, #60 |
| #75 Slice: content-approval spot-check sampling | `slice` | 5 | `slices/content-approval/sampling` | #64 |
| #76 Slice: content-generation kind: answer data | `slice` | 5 | `slices/content-generation/kinds/answer-data` | #65 |
| #77 Slice: content-generation kind: Japanese Explanations | `slice` | 5 | `slices/content-generation/kinds/explanation` | #65 |
| #78 Slice: content-generation kind: Grammar Point fields and Matcher Rules | `slice` | 5 | `slices/content-generation/kinds/grammar-fields` | #65 |
| #79 Slice: content-generation kind: merge and sense-alignment proposals | `slice` | 5 | `slices/content-generation/kinds/proposals` | #65 |
| #85 Slice: content-approval rubric: Examples and answer data | `slice` | 5 | `slices/content-approval/rubrics/example` | #64 |
| #86 Slice: content-approval rubric: Japanese Explanations | `slice` | 5 | `slices/content-approval/rubrics/explanation` | #64 |
| #87 Slice: content-approval rubric: Grammar Point fields and Matcher Rules | `slice` | 5 | `slices/content-approval/rubrics/grammar-fields` | #64 |
| #88 Slice: content-approval rubric: merge and alignment proposals | `slice` | 5 | `slices/content-approval/rubrics/proposals` | #64 |
| #89 Slice: content-approval rubric: refresh flags | `slice` | 5 | `slices/content-approval/rubrics/refresh` | #64 |
| #96 Seed: KANJIDIC2 and KRADFILE | `seed` | 6 | `slices/import/sources/kanjidic2` | #74 |
| #97 Seed: KanjiVG | `seed` | 6 | `slices/import/sources/kanjivg` | #74 |
| #98 Seed: Tatoeba Sentences | `seed` | 6 | `slices/import/sources/tatoeba` | #74, #49 |
| #99 Seed: Word JLPT Levels from yomitan-jlpt-vocab | `seed` | 6 | `slices/import/sources/yomitan-jlpt-vocab` | #74 |
| #100 Seed: Kanji JLPT Levels from Tanos | `seed` | 6 | `slices/import/sources/tanos-kanji` | #74 |
| #101 Seed: derived-link rebuilds | `seed` | 6 | `slices/import/sources/derived-links` | #74, #49 |
| #102 Seed: pitch accent from UniDic | `seed` | 6 | `slices/import/sources/unidic-pitch` | #74 |
| #103 Seed: Grammar Points from hanabira and Tanos | `seed` | 6 | `slices/import/sources/grammar-seed` | #74, #64, #79 |
| #104 Seed: Japanese Explanations from ja Wiktionary | `seed` | 6 | `slices/import/sources/ja-wiktionary` | #74, #64, #79 |
| #112 Seed: Matcher Rule runs | `seed` | 7 | `slices/import/sources/matcher-runs` | #74, #103 |

### M3: everything else (22 issues)

| Issue | Type | Layer | Folder | Blocked by |
|---|---|---|---|---|
| #66 Slice: listening free practice | `slice` | 4 | `slices/listening` | #50, #57, #48, #56, #52 |
| #67 Slice: cram | `slice` | 4 | `slices/cram` | #50, #57, #48, #56, #52 |
| #68 Slice: placement | `slice` | 4 | `slices/placement` | #50, #57, #48, #56, #47 |
| #69 Slice: credits | `slice` | 4 | `slices/credits` | #50, #57, #54 |
| #80 Slice: content-generation kind: Reading Passages and Batch Texts | `slice` | 5 | `slices/content-generation/kinds/reading-passage` | #65, #61 |
| #81 Slice: content-generation kind: Practice Texts | `slice` | 5 | `slices/content-generation/kinds/practice-text` | #65, #61 |
| #82 Slice: content-generation kind: listening dialogues | `slice` | 5 | `slices/content-generation/kinds/dialogue` | #65 |
| #83 Slice: content-generation kind: single-Sentence clip selection | `slice` | 5 | `slices/content-generation/kinds/clip-selection` | #65 |
| #84 Slice: content-generation kind: audio synthesis | `slice` | 5 | `slices/content-generation/kinds/synthesise` | #65 |
| #90 Slice: content-approval rubric: Reading Passages and Batch Texts | `slice` | 5 | `slices/content-approval/rubrics/reading-passage` | #64 |
| #91 Slice: content-approval rubric: Practice Texts | `slice` | 5 | `slices/content-approval/rubrics/practice-text` | #64 |
| #92 Slice: content-approval rubric: dialogues | `slice` | 5 | `slices/content-approval/rubrics/dialogue` | #64 |
| #93 Slice: content-approval rubric: Learner answer flags | `slice` | 5 | `slices/content-approval/rubrics/flags` | #64 |
| #94 Slice: reading (Reading Passages and Batch Text episodes) | `slice` | 5 | `slices/reading` | #50, #57, #48, #61 |
| #95 Slice: listening Practice Text dialogues | `slice` | 5 | `slices/listening/practice` | #66, #61, #55 |
| #105 Slice: learn Listening Clip lesson | `slice` | 6 | `slices/learn/listening` | #70 |
| #106 Slice: learn Batch Text hand-off | `slice` | 6 | `slices/learn/batch-text` | #70, #61, #55 |
| #107 Slice: learn now | `slice` | 6 | `slices/learn/learn-now` | #70 |
| #108 Slice: reviews Wrap-Up and Ghosts | `slice` | 6 | `slices/reviews/wrap-up` | #71 |
| #109 Slice: reviews Listening Clips | `slice` | 6 | `slices/reviews/listening` | #71 |
| #110 Slice: reviews 'my answer was right' flags | `slice` | 6 | `slices/reviews/flags` | #71 |
| #111 Slice: reading Practice Texts | `slice` | 6 | `slices/reading/practice` | #94, #55 |

68 issues in 8 layers. An issue's layer is one more than its deepest blocker's; everything in one layer can run in parallel once the layer before it is closed.

<!-- END GENERATED -->
