<p align="center">
  <img src="assets/icon.svg" width="96" height="96" alt="ibbun icon">
</p>

<h1 align="center">ibbun</h1>

<p align="center">
  Learn Japanese for the JLPT, N5 to N1, one sentence at a time.
</p>

<p align="center">
  <a href="assets/demo.mp4"><img src="assets/demo.gif" width="100%" alt="A walk through ibbun: logging in, the Today screen, a Learn batch with its quiz, the Library, the command menu and the five looks in Settings"></a>
</p>

ibbun teaches Kanji, Words, Grammar Points and Listening through real example sentences, on a spaced-repetition schedule. Reading passages grow longer as you progress and tell a continuing story. The suggested order is only a guide, so you can start any item whenever you like.

ibbun is a side project and a working showcase, still under construction. [docs/screens.md](docs/screens.md) lists what each screen does and which ones are still being redesigned.

## Run it

You need Node 24+, pnpm 12 and Docker.

```sh
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm --filter @ibbun/learner seed
pnpm --filter @ibbun/content-graph seed:fixture
pnpm dev
```

Open http://localhost:5173 and log in as `learner@ibbun.test` / `learner-password`. [docs/getting-started.md](docs/getting-started.md) covers importing the full dictionaries, the optional settings and the test commands.

## Code

A modular monolith: a small core with self-contained feature slices on top.

```
apps/       web (Vite + React), api (Hono), worker. Shells only.
core/       the shared domain: content graph, progress, learning path, learner
platform/   plumbing: db, jobs, auth, mail, ui, nlp, tts, llm
slices/     one folder per feature: learn, reviews, cram, ...
```

## Docs

- [Getting started](docs/getting-started.md): setup, real content, settings and commands
- [Screens](docs/screens.md): what each screen does and its state
- [Architecture](docs/architecture.md): slices, core modules and the dependency rules
- [Glossary](CONTEXT.md): what a Study Item, Example or Track means here
- [Decisions](docs/adr/): the ADRs
- [Build plan](docs/build-plan.md) and [licensing](docs/licensing.md)

Most of ibbun is built by AI agents, one issue per slice. Agents start with [CLAUDE.md](CLAUDE.md).
