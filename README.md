<p align="center">
  <img src="assets/icon.svg" width="96" height="96" alt="mojibun icon">
</p>

<h1 align="center">mojibun</h1>

<p align="center">
  Learn Japanese for the JLPT, N5 to N1, one sentence at a time.
</p>

---

mojibun teaches **Kanji, Words, Grammar Points and Listening** through real example sentences. You review them on a spaced-repetition schedule (FSRS, with Anki-style New → Learning → Young → Mature stages), so things come back just before you'd forget them.

It's built to be reading-heavy and fun. Alongside reviews, mojibun gives you JLPT-style reading passages that get longer as you progress and tell a continuing story. The suggested order is a guide, not a gate: you can always start any item you're curious about.

> **Status:** every issue in the [build plan](docs/build-plan.md) (M1 to M3) is merged. This is a side project and showcase, not a released product.

## What's in it

| Screen      | What it does                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Today       | Reviews due, new items waiting and your streak.                                                |
| Learn       | Batches of new Study Items: a lesson, a quiz, a Batch Text to read, and Listening Clip lessons. You can also learn any item now. |
| Reviews     | Your due Reviews, then due Listening Clips, a Wrap-Up of what you missed, and Ghosts from earlier sessions. You can flag an answer you think was right. |
| Reading     | Reading Passages, Batch Text episodes and Practice Texts.                                      |
| Listening   | Free listening practice and Practice Text dialogues.                                           |
| Cram        | Extra practice on any items you pick. Cram never changes your schedule.                        |
| Placement   | A test that finds your starting JLPT Level.                                                    |
| Browse      | Every Kanji, Word and Grammar Point, with their links.                                         |
| Settings    | Your account and preferences.                                                                  |
| Approval    | Supervisor only: the Content Approval queue for generated content.                             |
| Import      | Supervisor only: reports on Import Runs from the open datasets.                                |

The worker imports the open datasets (JMdict, KANJIDIC2, KanjiVG, Tatoeba, JLPT level lists, UniDic pitch accent, ja Wiktionary, the Grammar Point seed) on a schedule. It also generates content with Claude, which an LLM reviewer then checks.

## What it will look like

<p align="center">
  <img src="assets/screenshot-today.jpg" alt="The mojibun Today screen: a greeting with 18 reviews waiting, Start reviews and Learn 6 new buttons, and a yellow note showing 18 due, 6 new and a 42-day streak">
</p>

This is the Today screen from the design mock, the screen you land on when you open the app. The full mock is at [docs/design/mojibun-mock.html](docs/design/mojibun-mock.html), and the reasoning behind the Hum design is in [ADR 0011](docs/adr/0011-hum-visual-design.md).

## Run it locally

You need **Node 24+** and **Docker**. On Windows, run these commands in Git Bash.

```sh
corepack enable
pnpm install

cp .env.example .env
set -a; . ./.env; set +a      # load the env vars into your shell (repeat in every new shell)

docker compose up -d          # Postgres, Sudachi, VOICEVOX and Mailpit
pnpm db:migrate
pnpm --filter @mojibun/learner seed               # the two dev accounts
pnpm --filter @mojibun/content-graph seed:fixture # a small N5 content graph to study
pnpm dev
```

The first `docker compose up` builds the Sudachi image and downloads VOICEVOX, so it takes a few minutes. The seed commands are safe to run again.

Log in with one of the dev accounts. The passwords come from `.env`:

| Account                   | Password              | Role                                        |
| ------------------------- | --------------------- | ------------------------------------------- |
| `learner@mojibun.test`    | `learner-password`    | Learner                                     |
| `supervisor@mojibun.test` | `supervisor-password` | Supervisor: also sees Approval and Import   |

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

### If port 5432 is taken

If you already run PostgreSQL locally, it answers on port 5432 instead of the container, and `pnpm db:migrate` fails with `role "mojibun" does not exist`. You can stop your local server, or map the container to another port with a `compose.override.yaml`:

```yaml
services:
  postgres:
    ports: !override ["5433:5432"]
```

Then set `DATABASE_URL=postgres://mojibun:mojibun@localhost:5433/mojibun` in `.env`.

## Everyday commands

| Command          | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm test`      | Runs every test. Database tests use in-process PGlite, so no Docker. |
| `pnpm typecheck` | Type-checks the whole repo.                                         |
| `pnpm e2e`       | Runs the Playwright end-to-end tests. Needs Postgres up, migrated and seeded. |
| `pnpm depcruise` | Checks that nothing breaks the import rules between packages.       |

## How the code is organised

mojibun is a modular monolith: a small **core** with **feature slices** on top.

```
apps/       web (Vite + React), api (Hono), worker (pg-boss jobs). Shells only.
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

Most of mojibun is built by AI agents working in parallel, one issue per slice. If you're one of them, start with [CLAUDE.md](CLAUDE.md).
