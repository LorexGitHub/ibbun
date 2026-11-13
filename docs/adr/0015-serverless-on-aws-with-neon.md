# Serverless on AWS, with Neon for Postgres

mojibun runs only on a laptop today: a Hono API and a pg-boss worker as long-running Node processes, Postgres, and the Sudachi and VOICEVOX containers. Hosted in that shape, it would be RDS plus Fargate, which bills every hour whether anyone studies or not. mojibun is a showcase that will be idle most of the time, so it should cost almost nothing when idle and grow with use.

mojibun moves to a serverless stack on AWS in eu-central-1, defined with Alchemy v2 and Effect like the archived prototype (`archive/alchemy-scaffold`). Postgres moves to Neon, which scales to zero and stays real Postgres.

| Concern | Service | Notes |
| --- | --- | --- |
| Web app | S3 + CloudFront | `apps/web` as a static bundle. CloudFront also routes `/api/*` to the API and `/audio/*` to the audio bucket, with plain cache behaviours, so the app, the API and the audio share an origin. |
| API | Lambda, Node 24 on arm64, function URL behind CloudFront | `apps/api` through Hono's `aws-lambda` adapter. The Node server stays for local development. |
| Jobs | SQS + Lambda, EventBridge Scheduler for cron | A second implementation of the `Jobs` contract in `platform/jobs`. A failed job is retried by SQS and lands in a dead-letter queue. pg-boss goes. |
| Worker | Lambda, triggered by SQS | Runs the same handlers as `apps/worker`. |
| Sudachi, VOICEVOX | Lambda container images | The images we already build, run unchanged through the AWS Lambda Web Adapter. Only jobs call them, never a Learner's request, so their cold starts don't reach anyone. Calls are signed with IAM. |
| Imports | Fargate task, started on a schedule | Some downloads may run past Lambda's 15 minutes. |
| Database | Neon, Launch plan, `aws-eu-central-1` | Lambdas use the pooled endpoint. Migrations use the direct endpoint, because they hold a session-level advisory lock. |
| Mail | SES | Replaces Mailpit's role. |
| Audio, raw import files | S3 | A second `AudioStore` and an S3 location for `IMPORT_RAW_DIR`. |
| Secrets | SSM Parameter Store, SecureString | `AUTH_SECRET`, `ANTHROPIC_API_KEY`, the database URLs. Standard parameters are free. |

Local development does not change. `docker compose up` keeps running real Postgres, Sudachi, VOICEVOX and Mailpit, which is closer to production than any AWS emulator. We tested AWS's own emulator on 2026-11-13: its RDS PostgreSQL is SQLite behind the Postgres wire protocol, its Lambda Node runtime is QuickJS without `fetch` or `node:http`, and its ECS runs no container images.

## Why pg-boss goes

pg-boss polls Postgres every few seconds from a process that never stops. On Lambda nothing stays running to poll, and on Neon the polling would keep the database awake all month. At 0.25 CU that is about $19 a month for nothing, which is more than the whole stack costs at 100 Learners. SQS costs nothing while it waits: Lambda's long polling of an empty queue stays inside SQS's free million requests a month.

## Cost

`scripts/cost-model.mjs` estimates the monthly bill. It uses eu-central-1 list prices from the AWS Price List API and Neon's Launch prices, both read on 2026-11-13. It measures the database at 1.6 GB, the size of the local database with the real N5–N1 content. Each Learner is assumed to study 20 days a month, 1.5 sessions a day of 20 minutes, with 130 API calls and 2 Batch Texts a day.

| Active Learners | AWS + Neon | Claude for Batch Texts |
| --- | --- | --- |
| 0 | $2 | $0 |
| 10 | $5 | $12 |
| 100 | $17 | $120 |
| 1,000 | $21 | $127, at the budget cap |
| 10,000 | $154 | $127, at the budget cap |

- **Claude is the largest cost from the first Learners on.** ADR 0012 gives Batch Texts half of the 2,000,000-token daily budget, so their cost stops at about $127 a month. Beyond roughly 100 Learners, batches go out without a Batch Text. The other half pays for content generation and review, up to about $122 a month if the supervisor uses all of it.
- **The database is the largest AWS-side cost.** It stays asleep when nobody studies, and from about 100 Learners on it is awake most of the day.
- **Idle cost is about $2 a month.** That is database storage, the container images in ECR and the weekly imports.

Run `node scripts/cost-model.mjs 250 5000` to price other sizes, and edit the `learner` and `platform` objects to change the assumptions.

## Considered Options

- **RDS PostgreSQL and Fargate, as the code runs today.** It needs the fewest changes, but the database instance and the always-on containers bill every hour. That is roughly $30–80 a month before the first Learner.
- **Aurora Serverless v2.** It is real Postgres inside AWS and can pause at 0 ACU. The model prices it at about $48 a month at 100 Learners against Neon's $17, because its smallest running size is 0.5 ACU at $0.14 an hour. It takes about 15 s to resume, and the Lambdas would need either a VPC with a NAT gateway or a public IPv4 address that bills every hour.
- **Aurora DSQL.** It is serverless but only partly Postgres-compatible. It has no advisory locks, which the migration runner relies on.
- **DynamoDB, as in the archived prototype.** The Content Graph, progress and Content Approval are relational, and rewriting them for DynamoDB would be most of a rewrite of the app.
- **Keeping pg-boss on Lambda.** A scheduled Lambda could drain the queue every minute, but it would wake the database every minute and keep it awake.

## Consequences

- Neon is a second vendor next to AWS. Alchemy has a Neon provider, so the database is still declared in the same stack. Neon's region cannot be changed after the project is created.
- The first request after a quiet period waits for a Lambda cold start and for Neon to wake, a few hundred milliseconds each. A job may wait longer while VOICEVOX's large image starts, which no Learner sees.
- Session-level Postgres features work only on the direct endpoint. Application code that needs one must say so.
- Every `Jobs` handler must tolerate being run twice, because SQS delivers at least once.
- This decides the shape the app must have to run on AWS. No deploy is planned yet. Until one is, the stack is checked locally with `alchemy dev`.
- A deploy is not a public release. [licensing.md](../licensing.md) still requires a lawyer's review before the app is shown to people outside the team.
