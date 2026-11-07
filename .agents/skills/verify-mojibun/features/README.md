# mojibun verification map

The maintained source for verifying what mojibun's Learners and admins can do. One file per slice, plus the shell. Read this index, then the slice's file, before driving the app with [`../SKILL.md`](../SKILL.md).

## Baseline preconditions

- The stack was started by `verify.sh up` on the branch under test, from an empty `mojibun-verify` database.
- `verify.sh doctor` reports every line `ok` and the PR head commit.
- No Learner exists yet. Journeys that need one create it through sign-up (account slice) and confirm the mail in Mailpit.

## Driving conventions

- Start each file from the baseline unless its preconditions say otherwise.
- Locate by role and accessible name, never by CSS position.
- Commands are literal; `verify.sh` means `.agents/skills/verify-mojibun/scripts/verify.sh`.
- Use the terms in [CONTEXT.md](../../../../CONTEXT.md): Learner, Study Item, Review, Mastery.

## Proof and skip reporting

- Capture the action and the resulting state, under `target/verify/evidence/<slice>/`.
- UI proof is a screenshot plus an ARIA snapshot (`verify.sh shot`).
- Mutations also need a second, read-only view of the stored value: reload the page, another screen, or a `psql` query.
- Report an unreachable step with the command tried and the missing precondition. A step skipped is not a step verified.

## Feature entry contract

Each file has an H1, one paragraph of user-visible behaviour, then exactly these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright` (starting with `Preconditions:`, then labelled bullets pairing an action, a command and an observable result), `Gotchas`. A slice not built yet keeps the empty headings and says *Not built yet*.

## Features

- [App shell](./shell.md): layout, nav, home fallback, API health. Built.
- [learning-path](./learning-path.md): core Learning Path, seed and active Tracks. Core only; journeys arrive with learn and browse.
- [learn](./learn.md): Learn batches, lesson, quiz, Batch Text. Not built yet.
- [reviews](./reviews.md): Review session, Wrap-Up, Ghosts. Not built yet.
- [cram](./cram.md): practice without changing Mastery. Not built yet.
- [placement](./placement.md): per-level tick-list making items Known. Built.
- [browse](./browse.md): Kanji, Word and Grammar Point pages, search. Not built yet.
- [reading](./reading.md): Reading Passages, Batch Text episodes, Practice Texts. Not built yet.
- [listening](./listening.md): free Listening practice, dialogues. Not built yet.
- [dashboard](./dashboard.md): due counts, Mastery by level. Not built yet.
- [account](./account.md): sign-up, verify, login, reset, sessions, deletion. Not built yet.
- [content-graph fixture](./content-graph-fixture.md): hand-made N5 dev/test graph and its loader. Built.
- [import](./import.md): admin Import Runs and reports. Not built yet.
- [content-generation](./content-generation.md): admin Generation Requests and Runs. Not built yet.
- [content-approval](./content-approval.md): admin checks, reviewer agent, queue. Built (review job needs Sudachi and an LLM key).
- [credits](./credits.md): the public Credits page. Not built yet.

## Core modules without screens

- `core/progress` (Review log, Scheduler, Mastery, Known, Introduced): no Learner journey of its own. Its proof is the contract tests in `core/progress/src/tests/progress.contract.ts`, run against Postgres and the fake (`pnpm test:packages`). The `learn`, `reviews`, `placement` and `dashboard` journeys exercise it through their screens.
- `core/progress` texts (Batch Text and Practice Text records, their rolling 24 h counts, `isLevelCleared`, the Mixed-furigana rule `showsFurigana`): no Learner journey of its own. Its proof is `core/progress/src/tests/texts.contract.ts` (Postgres and the fake) and `core/progress/src/rules.test.ts`. The `learn`, `reading` and `listening` journeys exercise it through their screens.
