# infrastructure

`alchemy.run.ts` defines everything ADR 0015 and ADR 0017 put on AWS. Nothing is deployed. `alchemy dev` runs it on Alchemy's local emulator with Compose's Postgres, Mailpit, Sudachi and VOICEVOX standing in for Aurora, SES and the container functions, and `scripts/infra/tests/smoke.mjs` drives a Learner through it. See [`docs/infrastructure.md`](../../../../docs/infrastructure.md).

## Sub-features

- **The stack** (`alchemy.run.ts`): CloudFront, three S3 buckets, the API Lambda, Aurora Serverless v2 in public subnets, SSM, the $10 budget, and in a full stage the queue pair, worker Lambda, Scheduler entries, dead-letter alarm, Sudachi and VOICEVOX functions, the import task and SES. A stage named `showcase` leaves the jobs side out (`scripts/infra/stage.ts`).
- **Smoke test** (`scripts/infra/tests/smoke.mjs`): sign up, verify the mail, study a Learn batch, a Batch Text through SQS and the worker Lambda, a Listening Clip's audio through `/audio/*`.

## How to get to it (user POV)

Nothing in the browser differs. A Learner opens the router's URL, `http://localhost:9500` under `alchemy dev`, and uses the app as everywhere.

## Driving it with Playwright

Preconditions: Docker running; `docker compose up -d postgres mailpit sudachi voicevox`; `pnpm db:migrate` and `pnpm --filter @ibbun/content-graph seed:fixture` against that Postgres; `node scripts/infra/build.mjs`; `POSTGRES_PORT=<port> pnpm exec alchemy dev` running and printing `Done: <n> succeeded`.

- **Smoke test**: `DATABASE_URL=<owner url> node scripts/infra/tests/smoke.mjs`. Expect `PASS` for all 16 checks and no `FAIL`. The line "the API reports the Batch Text as preparing" is known (the Batch Text has no review rubric yet).
- **Router**: `curl -s http://localhost:9500/api/health` returns `{"ok":true}`, and `curl -s -o /dev/null -w '%{http_code}' http://localhost:9500/learn` returns `200`.
- **Showcase stage**: `POSTGRES_PORT=<port> pnpm exec alchemy dev --stage showcase`; the router is on the next port (9501) and no queue, worker or schedule is created.

## Gotchas

- The emulator cannot push container images from Docker Desktop on Windows, so locally the worker is a zip of the same handler and no image function starts.
- Aurora, SES, Budgets and the Fargate import task are not exercised by the emulator. A deploy must check them.
- `alchemy dev` keeps running after a failed apply and redeploys when a source file changes.
