<img src="assets/icon.svg" width="64" height="64" alt="">

# mojibun

Created in [T3 Code](https://t3.codes).

## Design

The app should end up looking like [docs/design/mojibun-mock.html](docs/design/mojibun-mock.html), a static mock in the Hum theme. See [ADR 0011](docs/adr/0011-hum-visual-design.md).

## Run it locally

Needs Node 24+ and Docker.

```sh
corepack enable
pnpm install
cp .env.example .env     # then export it, e.g. `set -a; . ./.env; set +a`
docker compose up -d     # Postgres, Sudachi, VOICEVOX, Mailpit (inbox at :8025)
pnpm db:migrate
pnpm dev                 # web :5173, api :3000, worker
```

`pnpm test` runs every test (Postgres tests use an in-process PGlite, no Docker). `pnpm typecheck` checks types.
To add a slice, add `slices/<name>/` with a `register.ts`; no other file changes ([architecture.md](docs/architecture.md#registration)).
