# Getting started

How to run ibbun on your machine, load content and log in.

## Requirements

Node 24+, pnpm 12 and Docker. If you don't have pnpm, run `npm install -g pnpm@12` (Node 25 and later no longer include `corepack`). The commands work the same in PowerShell, bash and zsh.

## Run it

```sh
pnpm install
cp .env.example .env          # every script reads it; no need to load it into your shell

docker compose up -d          # Postgres, Sudachi, VOICEVOX and Mailpit
pnpm db:migrate
pnpm --filter @ibbun/learner seed               # the two dev accounts
pnpm --filter @ibbun/content-graph seed:fixture # a small N5 content graph to study
pnpm dev
```

The first `docker compose up` builds the Sudachi image and downloads VOICEVOX, so it takes a few minutes. You can run the seed commands again safely. `pnpm dev` also starts the background worker.

| What        | Where                   |
| ----------- | ----------------------- |
| Web app     | http://localhost:5173   |
| API         | http://localhost:3000   |
| Mail inbox  | http://localhost:8025   |

## Dev accounts

The passwords come from `.env`.

| Account                 | Password              | Role                                      |
| ----------------------- | --------------------- | ----------------------------------------- |
| `learner@ibbun.test`    | `learner-password`    | Learner                                   |
| `supervisor@ibbun.test` | `supervisor-password` | Supervisor: also sees Approval and Import |

## The real content

The fixture has only a few items. To study the real content, skip `seed:fixture` and import every upstream dataset (JMdict, KANJIDIC2, KanjiVG, Tatoeba, the pitch and frequency dictionaries and the JLPT lists):

```sh
pnpm content:import
```

The fixture and the real content can't share a database, because the fixture uses the real Kanji and Words under other ids. The command refuses to run on a database that has the fixture.

It runs each import in order, then the grammar seed, the derived links, the levels and the matchers, and prints one line per step. The first run downloads a few hundred megabytes into `data/import-raw` and takes a while. Running it again is safe: it skips a dataset whose upstream version hasn't changed, and it resumes a run that stopped half way.

## Optional settings

| Variable                                    | What it does |
| ------------------------------------------- | ------------ |
| `ANTHROPIC_API_KEY`                         | Turns on content generation and approval (an `ant auth login` profile works too). Without it those jobs fail, but you can still study the seeded content. |
| `LLM_GENERATOR_MODEL`, `LLM_REVIEWER_MODEL` | Override the defaults, `claude-sonnet-5-5` and `claude-opus-5-5`. |
| `DAILY_TOKEN_BUDGET`                        | The daily token cap for generation. The default is 2,000,000. |
| `SUPERVISOR_EMAIL`                          | `seed` makes this account a Supervisor. |

## Everyday commands

| Command          | What it does |
| ---------------- | ------------ |
| `pnpm test`      | Runs every test. Database tests use in-process PGlite, so Docker isn't needed. |
| `pnpm typecheck` | Type-checks the whole repo. |
| `pnpm e2e`       | Runs the Playwright end-to-end tests. Needs Postgres up, migrated and seeded. |
| `pnpm depcruise` | Checks the import rules between packages. |

## Recording the demo video

`assets/showcase/demo.mjs` drives the app with Playwright and writes `assets/demo.mp4` and `assets/demo.gif`. Run it against a fresh database with the dev accounts and the N5 fixture, with ffmpeg on your `PATH`:

```sh
BASE_URL=http://localhost:5173 node assets/showcase/demo.mjs
```
