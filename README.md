<p align="center">
  <img src="assets/icon.svg" width="96" height="96" alt="ibbun icon">
</p>

<h1 align="center">ibbun</h1>

<p align="center">
  Learn Japanese for the JLPT, N5 to N1, one sentence at a time.
</p>

---

ibbun teaches **Kanji, Words, Grammar Points and Listening** through real example sentences. You review them on a spaced-repetition schedule (FSRS, with Anki-style New → Learning → Young → Mature stages), so things come back just before you'd forget them.

It's built to be reading-heavy and fun. Alongside reviews, ibbun gives you JLPT-style reading passages that get longer as you progress and tell a continuing story. The suggested order is a guide, not a gate: you can always start any item you're curious about.

> **Status:** a working showcase, still being built. Every issue in the [build plan](docs/build-plan.md) (M1 to M3) is merged, and a second pass is redesigning the screens one by one. What is not on `main` yet is marked **to be added** below. This is a side project, not a released product.

<p align="center">
  <a href="assets/demo.mp4"><img src="assets/demo.gif" width="100%" alt="A walk through ibbun: logging in, the Today screen, a Learn batch of seven Study Items, the quiz that asks a missed item again, the Library, and the five looks in Settings"></a>
</p>

## What's in it

| Screen | What it does | State |
| --- | --- | --- |
| Today | How many Reviews are due, the next step, your streak and your way up from N5 to N1. | Done |
| Learn | Batches of new Study Items: a lesson, a quiz, a Batch Text to read, and Listening Clip lessons. You can also learn any item now. | Done |
| Reviews | Your due Reviews, then due Listening Clips, a Wrap-Up of what you missed, and Ghosts from earlier sessions. You can flag an answer you think was right. | Done |
| Reading | Reading Passages, Batch Text episodes and Practice Texts. | Works. New layout to be added ([#222](https://github.com/LorexGitHub/ibbun/pull/222)) |
| Listening | Free listening practice and Practice Text dialogues. | Works. New player to be added ([#223](https://github.com/LorexGitHub/ibbun/pull/223)) |
| Cram | Extra practice on any items you pick. Cram never changes your schedule. | Works. New picker to be added ([#220](https://github.com/LorexGitHub/ibbun/pull/220)) |
| Placement | Mark what you already know at a JLPT Level, so it skips your Reviews. | Works. Tile wall to be added ([#224](https://github.com/LorexGitHub/ibbun/pull/224)) |
| Library | Every Kanji, Word and Grammar Point, with their links. | Works. Mastery wall to be added ([#221](https://github.com/LorexGitHub/ibbun/pull/221)) |
| Settings | Appearance (five looks, light or dark), your account and your study preferences. | Done |
| Approval | Supervisor only: the Content Approval queue for generated content. | Done |
| Import | Supervisor only: reports on Import Runs from the open datasets. | Done |

The worker imports the open datasets (JMdict, KANJIDIC2, KanjiVG, Tatoeba, JLPT level lists, UniDic pitch accent, ja Wiktionary, the Grammar Point seed) on a schedule. It also generates content with Claude, which an LLM reviewer then checks.

## Run it locally

You need **Node 24+**, **pnpm 12** and **Docker**. If you don't have pnpm, run `npm install -g pnpm@12` (Node 25 and later no longer include `corepack`). The commands work the same in PowerShell, bash and zsh.

```sh
pnpm install
cp .env.example .env          # every script reads it; no need to load it into your shell

docker compose up -d          # Postgres, Sudachi, VOICEVOX, Mailpit and ElasticMQ
pnpm db:migrate
pnpm --filter @ibbun/learner seed               # the two dev accounts
pnpm --filter @ibbun/content-graph seed:fixture # a small N5 content graph to study
pnpm dev
```

The first `docker compose up` builds the Sudachi image and downloads VOICEVOX, so it takes a few minutes. The seed commands are safe to run again.

### The real content

The fixture is a handful of items. To study the real thing instead, skip `seed:fixture` and import every upstream dataset (JMdict, KANJIDIC2, KanjiVG, Tatoeba, the pitch and frequency dictionaries and the JLPT lists):

```sh
pnpm content:import
```

The fixture and the real content cannot share a database, because the fixture's Kanji and Words are the real ones under other ids. Run it on a database you did not seed the fixture into; the command refuses otherwise.

It runs each import in order, then the grammar seed, the derived links, the levels and the matchers, and prints one line per step. It downloads a few hundred megabytes into `data/import-raw` and takes a while the first time. It is safe to run again: a dataset whose upstream version has not changed is skipped, and a run that stopped half way picks up where it left off.

Log in with one of the dev accounts. The passwords come from `.env`:

| Account                   | Password              | Role                                        |
| ------------------------- | --------------------- | ------------------------------------------- |
| `learner@ibbun.test`    | `learner-password`    | Learner                                     |
| `supervisor@ibbun.test` | `supervisor-password` | Supervisor: also sees Approval and Import   |

Then open:

| What        | Where                   |
| ----------- | ----------------------- |
| Web app     | http://localhost:5173   |
| API         | http://localhost:3000   |
| Mail inbox  | http://localhost:8025   |

The background worker starts with `pnpm dev` too.

### Optional settings

| Variable                                     | What it does                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`                          | Turns on content generation and approval (an `ant auth login` profile works too). Without it, those jobs fail, but you can still study the seeded content. |
| `LLM_GENERATOR_MODEL`, `LLM_REVIEWER_MODEL`  | Override the defaults, `claude-sonnet-5-5` and `claude-opus-5-5`.                                |
| `DAILY_TOKEN_BUDGET`                         | The daily token cap for generation. The default is 2,000,000.                                    |
| `SUPERVISOR_EMAIL`                           | `seed` makes this account a Supervisor.                                                          |

## Everyday commands

| Command          | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm test`      | Runs every test. Database tests use in-process PGlite, so no Docker. |
| `pnpm typecheck` | Type-checks the whole repo.                                         |
| `pnpm e2e`       | Runs the Playwright end-to-end tests. Needs Postgres up, migrated and seeded. |
| `pnpm depcruise` | Checks that nothing breaks the import rules between packages.       |

## How the code is organised

ibbun is a modular monolith: a small **core** with **feature slices** on top.

```
apps/       web (Vite + React), api (Hono), worker (SQS jobs). Shells only.
core/       the shared domain: content graph, progress, learning path, learner
platform/   plumbing: db, jobs, auth, mail, ui, nlp, tts, llm
slices/     one folder per feature: learn, reviews, cram, ...
```

Each slice is self-contained and never imports another slice. To add one, create `slices/<name>/` with a `register.ts`; the apps pick it up automatically. The full rules are in [docs/architecture.md](docs/architecture.md).

## Further reading

- [CONTEXT.md](CONTEXT.md): the glossary. What a Study Item, Example or Track means here.
- [docs/architecture.md](docs/architecture.md): slices, core modules and the dependency rules CI enforces.
- [docs/adr/](docs/adr/): the decisions and why they were made.
- [docs/build-plan.md](docs/build-plan.md): what's being built, and in what order.
- [docs/licensing.md](docs/licensing.md): where content comes from and how it's attributed.

## Contributing

Most of ibbun is built by AI agents working in parallel, one issue per slice. If you're one of them, start with [CLAUDE.md](CLAUDE.md).
