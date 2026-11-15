# infrastructure

`infra/` is the Terraform stack for the AWS side of ADR 0015, ADR 0017 and ADR 0018. Only the showcase stage (`infra/showcase`) is ported. See [`docs/infrastructure.md`](../../../../docs/infrastructure.md).

## Sub-features

- **The showcase stage** (`infra/showcase`, modules in `infra/modules`): CloudFront, the web and audio buckets, the API Lambda behind an `AWS_IAM` function URL, Aurora Serverless v2 and SSM.
- **Build and deploy scripts** (`scripts/infra/`): `pnpm stack:build:api`, `pnpm stack:build`, `pnpm stack:deploy:web`.

## How to get to it (user POV)

A Learner opens the stage's CloudFront URL (`terraform output url` in `infra/showcase`) and uses the app as everywhere.

## Driving it with Playwright

Needs a deployed showcase stage and AWS credentials. Open the output URL, check `/api/health` returns `{"ok":true}`, and that a client route such as `/learn` returns the app.

## Gotchas

- There is no local emulator. Locally the app runs on `docker compose`.
- The jobs side (queue, worker, schedules, Sudachi, VOICEVOX, imports, SES) is not in Terraform yet.
