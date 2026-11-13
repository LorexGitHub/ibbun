# Architecture

Decided in [#14](https://github.com/LorexGitHub/ibbun/issues/14). Terms follow [CONTEXT.md](../CONTEXT.md). Why the rules are what they are is in [ADR 0003](adr/0003-feature-slices-over-core-modules.md).

ibbun is a **modular monolith of feature slices on top of a small core**. Many AI agents build it in parallel, and one human supervisor oversees without reading code. Every rule below exists so that one agent working on one issue changes one folder, and CI, not a person, catches anything that breaks the rules.

## Processes

One TypeScript monorepo (#2) with three thin entry points:

- `apps/web`: the Vite + React SPA. Learner screens, plus admin screens under `/admin` behind a role check.
- `apps/api`: the Hono HTTP API.
- `apps/worker`: background jobs from a Postgres-backed queue (pg-boss): re-imports, derived-link rebuilds, generation, TTS, the reviewer agent. Audio files go to object storage: a local directory in dev, S3 on AWS (`AUDIO_DIR=s3://bucket/audio/`), served by CloudFront under `/audio/*`.

Docker Compose also runs Postgres, the Sudachi sidecar, VOICEVOX (#11) and Mailpit ([accounts.md](accounts.md#email)).

The apps contain no features. They discover slices and mount what each slice registers (see [Registration](#registration)).

## Layout

```
apps/            web, api, worker   ← shells only
core/            content-graph, progress, learning-path, learner
platform/        db, jobs, auth, mail, ui, nlp, tts, llm
slices/          learn, reviews, cram, ...
  <slice>/
    contract.ts  ← Zod request/response schemas, shared by web and server
    register.ts  ← the slice's routes, jobs, web routes, widgets and nav entry
    server/      ← Hono routes, job handlers, use cases
    web/         ← React routes and components
    db/          ← the slice's private tables and migrations
    tests/
```

Every core module, platform package and slice is its own workspace package. Its `package.json` `exports` field lists its public interface. Nothing else can be imported.

## Core modules

Each core module owns its tables in its own Postgres schema. It exposes a typed interface and ships an in-memory **fake** and **contract tests** that run against both the real module and the fake.

| Module | Owns | Interface gives |
|---|---|---|
| `content-graph` | Every Content Graph table: Study Items, Sentences, Examples, Reading Passages, links, source keys, overrides, Provenance, approval, retirement ([content-graph.md](content-graph.md)) | **`content-graph`**: reads of approved, non-retired content with overrides applied. Also the pure `grade()` function every Learner-facing slice uses ([review-answer-model.md](review-answer-model.md)). **`content-graph/authoring`**: writes, approval and retirement, plus reads that include drafts, plus `applySnapshot()`, which owns the refresh rules ([import-pipeline.md](import-pipeline.md)) |
| `progress` | The append-only Review log, the `Scheduler` adapter (ts-fsrs), and the Mastery and Known projections ([ADR 0001](adr/0001-fsrs-6-and-anki-style-mastery.md)) | `record(review)` for every Review `kind`, schedule and Mastery reads, Batch Text and Practice Text records ([batch-text.md](batch-text.md), [listening.md](listening.md#practice-texts)), `isLevelCleared()`, the furigana rule |
| `learning-path` | The versioned strategy for the order Study Items are offered in and for locking, each Learner's seed and active Tracks ([learning-path.md](learning-path.md)) | `next()` for a Learn batch, `forItem()` for Learn now, `isLocked()`, active Track reads and writes |
| `learner` | Accounts, sessions, roles, Learner preferences, behind Better Auth, which nothing else imports ([accounts.md](accounts.md)) | Identity, role and preference reads and writes, `authHandler`, `SessionResolver`, `learner/client` |

Allowed dependencies between core modules: `learning-path` → `content-graph`, `progress`. `progress` → `content-graph` (IDs only). Nothing in core depends on `learning-path`. Core never depends on a slice.

## Platform packages

Plumbing with no domain logic: `db` (client, migration runner, transactions), `jobs` (queue), `auth` (`requireLearner()` and `requireRole()` middleware against `learner`'s `SessionResolver`), `mail` (templates, with Mailpit locally), `ui` (the Ma kit: tokens, five looks, `design.md`), and shared Zod primitives.

Each external service has an adapter package with an interface and a fake: `nlp` (Sudachi), `tts` (VOICEVOX), `llm` (generation and the reviewer agent). Only admin slices may use them.

## Slices

| Slice | Audience | Covers |
|---|---|---|
| `learn` | Learner | Choosing a batch (asks `learning-path`), the lesson, the quiz that must be answered fully correctly, enqueuing and showing the Batch Text ([batch-text.md](batch-text.md)) |
| `reviews` | Learner | Review session, Wrap-Up, Ghosts |
| `cram` | Learner | Choosing items and practising without changing Mastery |
| `placement` | Learner | The per-level tick-list that makes items Known |
| `browse` | Learner | Kanji, Word and Grammar Point pages, search, level lists |
| `reading` | Learner | Reading Passages, the Learner's past Batch Texts as episodes per level, Practice Text passages and their Generate screen ([listening.md](listening.md#practice-texts)) |
| `listening` | Learner | Free Listening practice logged as `cram`, Practice Text dialogues and their Generate screen ([listening.md](listening.md)). Scheduled Listening Clip Reviews run in `reviews` |
| `dashboard` | Learner | Due counts and Mastery by level |
| `account` | Learner | Sign-up, verify, login, reset, sessions, account deletion and settings screens (the data lives in `learner`; [accounts.md](accounts.md)) |
| `import` | Admin | Scheduled fetch and parse of JMdict, KANJIDIC2, KanjiVG, Tatoeba and yomitan-jlpt-vocab into snapshots, one-time parse of the Tanos kanji lists ([jlpt-levels.md](jlpt-levels.md)), Import Run reports, derived-link rebuilds. One-time parse of hanabira and Tanos grammar, and Matcher Rule runs ([grammar-points.md](grammar-points.md)). Mapping, retirement and override rules are in core `applySnapshot()` |
| `content-generation` | Admin | Generation Requests and Runs: Sentences, answer data, Japanese Explanations, Grammar Point drafts, proposals, Reading Passages, Batch Texts, Practice Texts, dialogues, single-Sentence clip selection, Sentence Audio and Listening Clips (TTS) ([content-approval.md](content-approval.md), [listening.md](listening.md)) |
| `content-approval` | Admin | Automatic checks, the reviewer agent, Approval Decisions, the queue, supervisor spot-check sampling ([content-approval.md](content-approval.md), [ADR 0010](adr/0010-reviewer-agent-approves-supervisor-samples.md)) |
| `credits` | Public | The Credits page ([licensing.md](licensing.md), #19). The footer and inline Attribution are not a slice: `content-graph` returns each record's Attribution, and `platform/ui` renders it |

A new feature is a new slice. Learner notes and Sentences, custom decks and mock JLPT tests are not in v1.

## Dependency rules

CI fails the build when any of these is broken (package `exports` plus dependency-cruiser):

1. A slice imports only core interfaces, platform packages and its own files. **A slice never imports another slice.**
2. Nothing imports another package's internals, only what its `exports` list.
3. A Learner-facing slice never imports `content-graph/authoring`, `nlp`, `tts` or `llm`.
4. Code queries only its own package's Postgres schema. Data from elsewhere comes through an interface.
5. Core never imports a slice, and core modules follow the dependency rules between core modules above.

How slices interact:

- **Through core, synchronously.** For example, Learn writes Reviews with `progress.record()`, and Reading feeds Mastery the same way. There is no event bus.
- **Background work** goes through `jobs`. The slice that enqueues a job also owns its handler. The one exception: a job contract (name plus Zod payload) may live in core, so a Learner-facing slice can enqueue work an admin slice handles. There are five: `batch-text.generate` ([ADR 0008](adr/0008-batch-texts-generated-per-learner.md)), `practice.generate` ([ADR 0013](adr/0013-practice-texts-after-a-cleared-level.md)), `listening.synthesise`, and `content.generate` and `content.review`, which let the two admin slices hand drafts back and forth ([content-approval.md](content-approval.md#wiring)).
- **Screens that show more than one slice** are assembled by `apps/web` from widgets that each slice registers. Neither slice knows about the other.

## Data

- **One Postgres schema per package**, for example `content_graph`, `progress`, `cram`.
- **A slice may own private tables** in its schema. Once a second slice needs the data, the table moves into a core module.
- **Migrations live in each package**, named with a timestamp prefix. The `db` runner collects them all and applies them in timestamp order, so two agents never edit the same migration file.
- **Transactions:** every core write function accepts an optional `tx`. Only slices open transactions; core never decides where one starts or ends.

## Registration

Each slice exports one `register` object from `register.ts`: its API routes, job handlers, web routes, widgets and nav entry. `apps/web` finds slices with a Vite glob import, and `apps/api` and `apps/worker` with a generated index. Adding a slice touches only the slice's own folder.

## Changing the core

- **Wave 0 builds the core first:** the four core modules with their tables, interfaces, fakes and contract tests, the platform packages, the app shells and `verify-ibbun`. Slices are built in parallel after that.
- **Additive** core changes (a new function, a new optional field, a new table) may go in the slice PR that needs them. They merge on CI plus a reviewer agent.
- **Breaking** changes (changing or removing something that existing callers use) and **new core modules** get their own issue and need supervisor approval.
- **Duplication beats coupling.** Small logic is copied between slices until a third slice needs it. Domain rules (what counts as Known, what is visible) always live in core. Cross-package duplication found by `dryer` is reported. When three or more packages share it, the reviewer agent opens a "move into core" issue.

## Done for a slice or core change

Agents work in [ub-mode](../.agents/skills/ub-mode/SKILL.md), which includes TDD. A PR merges only when all of these pass:

| Gate | Where it runs |
|---|---|
| Vitest tests of behaviour, against core fakes or a real Postgres | CI |
| Core contract tests, run against both the real module and its fake | CI |
| `crapper --changed`: every function under CRAP 10 | CI |
| `dryer`, run per package: no duplication within a package at 0.8 or above | CI |
| `mutator` on changed files: no surviving mutants, no uncovered code | CI |
| dependency-cruiser [rules](#dependency-rules) | CI |
| One Playwright spec per Learner-facing slice | CI |
| `verify-ibbun` journeys for every slice the PR touches | Verifier agent, on the PR |

There is no coverage percentage; CRAP and mutation testing are stricter.

### Verification flow (pstack)

1. **Wave 0:** `/create-verification-skill` (from [pstack-claude](https://github.com/michael-denyer/pstack-claude)) generates `.agents/skills/verify-ibbun/`: launch and teardown of the Compose stack, a doctor check, a browser-driving recipe and a feature map.
2. **Before opening a PR:** the author adds or updates its slice's file in `verify-ibbun/features/` with `/maintain-verification-skill`.
3. **After the PR opens:** a separate verifier agent, never the author, runs `verify-ibbun` on the PR branch and attaches the evidence. The PR merges only when that evidence passes.

The supervisor doesn't review code; they spot-check samples.
