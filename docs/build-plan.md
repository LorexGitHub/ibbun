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
| `skeleton` Wave 0: monorepo, db, jobs, app shells and Compose | `wave-0` | 0 | `apps/*, platform/db, platform/jobs, root config` | none |
| `gates` Wave 0: CI gates | `wave-0` | 1 | `.github/workflows, root config` | `skeleton` |
| `cg-core` Wave 0: content-graph schema, reads, fake and contract tests | `wave-0` | 2 | `core/content-graph` | `skeleton`, `gates` |
| `learner` Wave 0: learner accounts, sessions and roles; platform auth and mail | `wave-0` | 2 | `core/learner, platform/auth, platform/mail` | `skeleton`, `gates` |
| `adapters` Wave 0: nlp, tts and llm adapters with fakes | `wave-0` | 2 | `platform/nlp, platform/tts, platform/llm` | `skeleton`, `gates` |
| `ui` Wave 0: Hum UI kit from the mock | `wave-0` | 2 | `platform/ui` | `skeleton`, `gates` |
| `cg-authoring` Wave 0: content-graph/authoring writes, Approval Decisions and Generation Requests | `wave-0` | 3 | `core/content-graph (authoring entry point)` | `cg-core` |
| `cg-grade` Wave 0: the pure grade() function | `wave-0` | 3 | `core/content-graph (grade)` | `cg-core` |
| `cg-checks` Wave 0: automatic content checks | `wave-0` | 3 | `core/content-graph (authoring/checks)` | `cg-core` |
| `cg-attribution` Wave 0: licences and Attribution | `wave-0` | 3 | `core/content-graph (licensing)` | `cg-core` |
| `cg-jobs` Wave 0: shared job contracts | `wave-0` | 3 | `core/content-graph (jobs)` | `cg-core` |
| `progress-log` Wave 0: progress Review log, Scheduler, Mastery and Known | `wave-0` | 3 | `core/progress` | `cg-core` |
| `verify` Wave 0: verify-mojibun skill | `wave-0` | 3 | `.agents/skills/verify-mojibun` | `skeleton`, `ui` |
| `fixture` Wave 0: hand-made N5 fixture graph for dev and test | `wave-0` | 4 | `core/content-graph (fixtures)` | `cg-authoring` |
| `cg-snapshot` Wave 0: applySnapshot() and the refresh rules | `wave-0` | 4 | `core/content-graph (authoring/snapshot)` | `cg-authoring` |
| `cg-levels` Wave 0: Level Candidates, derived levels and computed levels | `wave-0` | 4 | `core/content-graph (levels)` | `cg-authoring` |
| `progress-texts` Wave 0: Batch Text and Practice Text records, Cleared Level, furigana rule | `wave-0` | 4 | `core/progress (texts)` | `progress-log` |
| `learning-path` Wave 0: learning-path strategy, Tracks and seed | `wave-0` | 4 | `core/learning-path` | `cg-core`, `progress-log` |
| `account` Slice: account | `slice` | 4 | `slices/account` | `ui`, `verify`, `learner` |
| `learn-base` Slice: learn (batch, lesson, quiz) | `slice` | 5 | `slices/learn` | `ui`, `verify`, `learner`, `learning-path`, `progress-log`, `cg-grade`, `fixture` |
| `reviews-base` Slice: reviews (session) | `slice` | 5 | `slices/reviews` | `ui`, `verify`, `learner`, `progress-log`, `cg-grade`, `fixture` |
| `dashboard` Slice: dashboard | `slice` | 5 | `slices/dashboard` | `ui`, `verify`, `learner`, `progress-log`, `fixture` |
| `browse` Slice: browse | `slice` | 5 | `slices/browse` | `ui`, `verify`, `learner`, `cg-core`, `learning-path`, `fixture` |

### M2: real content (23 issues)

| Issue | Type | Layer | Folder | Blocked by |
|---|---|---|---|---|
| `approval-base` Slice: content-approval (checks, reviewer agent, queue) | `slice` | 4 | `slices/content-approval` | `ui`, `verify`, `learner`, `cg-authoring`, `cg-checks`, `cg-jobs`, `adapters` |
| `gen-base` Slice: content-generation (requests, runs, budget) and Example Sentences | `slice` | 4 | `slices/content-generation` | `ui`, `verify`, `learner`, `cg-authoring`, `cg-jobs`, `cg-attribution`, `adapters` |
| `import-base` Seed: import framework and JMdict | `seed` | 5 | `slices/import` | `ui`, `verify`, `learner`, `cg-snapshot`, `cg-levels` |
| `approval-sampling` Slice: content-approval spot-check sampling | `slice` | 5 | `slices/content-approval/sampling` | `approval-base` |
| `gen-answer-data` Slice: content-generation kind: answer data | `slice` | 5 | `slices/content-generation/kinds/answer-data` | `gen-base` |
| `gen-explanation` Slice: content-generation kind: Japanese Explanations | `slice` | 5 | `slices/content-generation/kinds/explanation` | `gen-base` |
| `gen-grammar-fields` Slice: content-generation kind: Grammar Point fields and Matcher Rules | `slice` | 5 | `slices/content-generation/kinds/grammar-fields` | `gen-base` |
| `gen-proposals` Slice: content-generation kind: merge and sense-alignment proposals | `slice` | 5 | `slices/content-generation/kinds/proposals` | `gen-base` |
| `rubric-example` Slice: content-approval rubric: Examples and answer data | `slice` | 5 | `slices/content-approval/rubrics/example` | `approval-base` |
| `rubric-explanation` Slice: content-approval rubric: Japanese Explanations | `slice` | 5 | `slices/content-approval/rubrics/explanation` | `approval-base` |
| `rubric-grammar-fields` Slice: content-approval rubric: Grammar Point fields and Matcher Rules | `slice` | 5 | `slices/content-approval/rubrics/grammar-fields` | `approval-base` |
| `rubric-proposals` Slice: content-approval rubric: merge and alignment proposals | `slice` | 5 | `slices/content-approval/rubrics/proposals` | `approval-base` |
| `rubric-refresh` Slice: content-approval rubric: refresh flags | `slice` | 5 | `slices/content-approval/rubrics/refresh` | `approval-base` |
| `import-kanjidic2` Seed: KANJIDIC2 and KRADFILE | `seed` | 6 | `slices/import/sources/kanjidic2` | `import-base` |
| `import-kanjivg` Seed: KanjiVG | `seed` | 6 | `slices/import/sources/kanjivg` | `import-base` |
| `import-tatoeba` Seed: Tatoeba Sentences | `seed` | 6 | `slices/import/sources/tatoeba` | `import-base`, `adapters` |
| `import-yomitan` Seed: Word JLPT Levels from yomitan-jlpt-vocab | `seed` | 6 | `slices/import/sources/yomitan-jlpt-vocab` | `import-base` |
| `import-tanos-kanji` Seed: Kanji JLPT Levels from Tanos | `seed` | 6 | `slices/import/sources/tanos-kanji` | `import-base` |
| `import-derived-links` Seed: derived-link rebuilds | `seed` | 6 | `slices/import/sources/derived-links` | `import-base`, `adapters` |
| `import-unidic` Seed: pitch accent from UniDic | `seed` | 6 | `slices/import/sources/unidic-pitch` | `import-base` |
| `import-grammar` Seed: Grammar Points from hanabira and Tanos | `seed` | 6 | `slices/import/sources/grammar-seed` | `import-base`, `approval-base`, `gen-proposals` |
| `import-wiktionary` Seed: Japanese Explanations from ja Wiktionary | `seed` | 6 | `slices/import/sources/ja-wiktionary` | `import-base`, `approval-base`, `gen-proposals` |
| `import-matcher` Seed: Matcher Rule runs | `seed` | 7 | `slices/import/sources/matcher-runs` | `import-base`, `import-grammar` |

### M3: everything else (22 issues)

| Issue | Type | Layer | Folder | Blocked by |
|---|---|---|---|---|
| `listening-base` Slice: listening free practice | `slice` | 4 | `slices/listening` | `ui`, `verify`, `learner`, `progress-log`, `cg-grade` |
| `cram` Slice: cram | `slice` | 4 | `slices/cram` | `ui`, `verify`, `learner`, `progress-log`, `cg-grade` |
| `placement` Slice: placement | `slice` | 4 | `slices/placement` | `ui`, `verify`, `learner`, `progress-log`, `cg-core` |
| `credits` Slice: credits | `slice` | 4 | `slices/credits` | `ui`, `verify`, `cg-attribution` |
| `gen-reading-passage` Slice: content-generation kind: Reading Passages and Batch Texts | `slice` | 5 | `slices/content-generation/kinds/reading-passage` | `gen-base`, `progress-texts` |
| `gen-practice-text` Slice: content-generation kind: Practice Texts | `slice` | 5 | `slices/content-generation/kinds/practice-text` | `gen-base`, `progress-texts` |
| `gen-dialogue` Slice: content-generation kind: listening dialogues | `slice` | 5 | `slices/content-generation/kinds/dialogue` | `gen-base` |
| `gen-clip-selection` Slice: content-generation kind: single-Sentence clip selection | `slice` | 5 | `slices/content-generation/kinds/clip-selection` | `gen-base` |
| `gen-synthesise` Slice: content-generation kind: audio synthesis | `slice` | 5 | `slices/content-generation/kinds/synthesise` | `gen-base` |
| `rubric-reading-passage` Slice: content-approval rubric: Reading Passages and Batch Texts | `slice` | 5 | `slices/content-approval/rubrics/reading-passage` | `approval-base` |
| `rubric-practice-text` Slice: content-approval rubric: Practice Texts | `slice` | 5 | `slices/content-approval/rubrics/practice-text` | `approval-base` |
| `rubric-dialogue` Slice: content-approval rubric: dialogues | `slice` | 5 | `slices/content-approval/rubrics/dialogue` | `approval-base` |
| `rubric-flags` Slice: content-approval rubric: Learner answer flags | `slice` | 5 | `slices/content-approval/rubrics/flags` | `approval-base` |
| `reading-base` Slice: reading (Reading Passages and Batch Text episodes) | `slice` | 5 | `slices/reading` | `ui`, `verify`, `learner`, `progress-texts` |
| `listening-practice` Slice: listening Practice Text dialogues | `slice` | 5 | `slices/listening/practice` | `listening-base`, `progress-texts`, `cg-jobs` |
| `learn-listening` Slice: learn Listening Clip lesson | `slice` | 6 | `slices/learn/listening` | `learn-base` |
| `learn-batch-text` Slice: learn Batch Text hand-off | `slice` | 6 | `slices/learn/batch-text` | `learn-base`, `progress-texts`, `cg-jobs` |
| `learn-now` Slice: learn now | `slice` | 6 | `slices/learn/learn-now` | `learn-base` |
| `reviews-wrapup` Slice: reviews Wrap-Up and Ghosts | `slice` | 6 | `slices/reviews/wrap-up` | `reviews-base` |
| `reviews-listening` Slice: reviews Listening Clips | `slice` | 6 | `slices/reviews/listening` | `reviews-base` |
| `reviews-flags` Slice: reviews 'my answer was right' flags | `slice` | 6 | `slices/reviews/flags` | `reviews-base` |
| `reading-practice` Slice: reading Practice Texts | `slice` | 6 | `slices/reading/practice` | `reading-base`, `cg-jobs` |

68 issues in 8 layers. An issue's layer is one more than its deepest blocker's; everything in one layer can run in parallel once the layer before it is closed.

<!-- END GENERATED -->
