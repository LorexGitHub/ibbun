# Serverless on AWS, with Aurora Serverless v2

mojibun runs only on a laptop today: a Hono API and a pg-boss worker as long-running Node processes, Postgres, and the Sudachi and VOICEVOX containers. Hosted in that shape, it would be RDS plus Fargate, which bills every hour whether anyone studies or not. mojibun is a showcase that will be idle most of the time, so it should cost little when idle and grow with use.

mojibun gets the shape it needs to run serverless on AWS in eu-central-1, entirely on AWS services, defined with Alchemy v2 and Effect like the archived prototype (`archive/alchemy-scaffold`). Postgres becomes Aurora Serverless v2, which pauses when nobody uses it and stays real Postgres.

| Concern | Service | Notes |
| --- | --- | --- |
| Web app | S3 + CloudFront | `apps/web` as a static bundle. CloudFront also routes `/api/*` to the API and `/audio/*` to the audio bucket, with plain cache behaviours, so the app, the API and the audio share an origin. |
| API | Lambda, Node 24 on arm64, function URL behind CloudFront | `apps/api` through Hono's `aws-lambda` adapter. The Node server stays for local development. |
| Jobs | SQS + Lambda, EventBridge Scheduler for cron | A second implementation of the `Jobs` contract in `platform/jobs`. A failed job is retried by SQS and lands in a dead-letter queue. pg-boss goes. |
| Worker | Lambda, triggered by SQS | Runs the same handlers as `apps/worker`. |
| Sudachi, VOICEVOX | Lambda container images | The images we already build, run unchanged through the AWS Lambda Web Adapter. Only jobs call them, never a Learner's request, so their cold starts don't reach anyone. Calls are signed with IAM. |
| Imports | Fargate task, started on a schedule | Some downloads may run past Lambda's 15 minutes. |
| Database | Aurora Serverless v2, PostgreSQL, auto-pause | Pauses after 5 idle minutes. Publicly reachable over TLS only, with IAM database authentication, so the Lambdas need neither a VPC nor a NAT gateway. |
| Mail | SES | Replaces Mailpit's role. |
| Audio, raw import files | S3 | A second `AudioStore` and an S3 location for `IMPORT_RAW_DIR`. |
| Secrets | SSM Parameter Store, SecureString | `AUTH_SECRET`, `ANTHROPIC_API_KEY`. Standard parameters are free. The database needs no password in the app, because IAM issues its tokens. |

Local development does not change. `docker compose up` keeps running real Postgres, Sudachi, VOICEVOX and Mailpit, which is closer to production than any AWS emulator. We tested AWS's own emulator on 2026-11-13: its RDS PostgreSQL is SQLite behind the Postgres wire protocol, its Lambda Node runtime is QuickJS without `fetch` or `node:http`, and its ECS runs no container images.

## How the Lambdas reach the database

A Lambda inside a VPC can reach Aurora privately, but then it can reach nothing else: SQS, SES, SSM and the Claude API would need a NAT gateway or one interface endpoint each, about $9 a month per endpoint and more for NAT, before the first Learner. So the Lambdas stay outside the VPC, and Aurora gets a public endpoint with three guards:

- TLS is required (`rds.force_ssl`).
- Logins use IAM authentication tokens, which last 15 minutes and are signed by each Lambda's role. There is no long-lived password to guess or leak.
- The app's database role has only the rights it needs. Migrations use a separate role.

Two things follow. The API's `pg` pool stays small (one or two connections per Lambda), and the worker's reserved concurrency is capped, so connections stay below Aurora's limit. And the first request after a pause waits about 15 s while Aurora resumes, so the API Lambda's timeout is 30 s and the web app shows that it is loading.

## Why pg-boss goes

pg-boss polls Postgres every few seconds from a process that never stops. On Lambda nothing stays running to poll, and against Aurora the polling would keep the database from ever pausing: 730 h × 0.5 ACU × $0.14 is about $51 a month for nothing. SQS costs nothing while it waits: Lambda's long polling of an empty queue stays inside SQS's free million requests a month.

## Cost

`scripts/cost-model.mjs` estimates the monthly bill from eu-central-1 list prices in the AWS Price List API, read on 2026-11-13. It measures the database at 1.6 GB, the size of the local database with the real N5–N1 content. Each Learner is assumed to study 20 days a month, 1.5 sessions a day of 20 minutes, with 130 API calls and 2 Batch Texts a day.

| Active Learners | AWS, Aurora Serverless v2 | AWS, RDS db.t4g.micro | Claude for Batch Texts |
| --- | --- | --- | --- |
| 0 | $6 | $21 | $0 |
| 10 | $14 | $21 | $12 |
| 100 | $48 | $21 | $120 |
| 1,000 | $68 | $21 | $127, at the budget cap |

- **The database is most of the AWS bill.** Aurora bills $0.14 an hour for its smallest running size (0.5 ACU) whenever someone is studying, and from about 100 Learners on that is most of the day. Its public IPv4 address adds $3.65 a month, paused or not.
- **Idle cost is about $6 a month.** That is the IPv4 address, database storage, the container images in ECR and the weekly imports.
- **Claude is the largest cost from the first Learners on.** ADR 0012 gives Batch Texts half of the 2,000,000-token daily budget, so their cost stops at about $127 a month. Beyond roughly 100 Learners, batches go out without a Batch Text. The other half pays for content generation and review, up to about $122 a month if the supervisor uses all of it.

Run `node scripts/cost-model.mjs 250 5000` to price other sizes, and edit the `learner` and `platform` objects to change the assumptions.

## Considered Options

- **RDS PostgreSQL db.t4g.micro, always on.** It is a flat $21 a month and beats Aurora from about 20 regular Learners on, but it costs that much with nobody studying, and one micro instance has 1 GB of memory. Both are plain Postgres to the app, so switching later changes only the stack, not the code.
- **Lambdas inside the VPC.** They would reach a private Aurora, but every other service would need a NAT gateway or interface endpoints, about $30–50 a month before the first Learner.
- **The RDS Data API.** It keeps Aurora private without a VPC for the Lambdas, but the app would trade `pg` for a different driver, the migration runner's session lock would not work, and nothing faithful runs it locally.
- **Aurora DSQL.** It is serverless but only partly Postgres-compatible. It has no foreign keys and no advisory locks, and the schema and the migration runner rely on both.
- **DynamoDB, as in the archived prototype.** The Content Graph, progress and Content Approval are relational, and rewriting them for DynamoDB would be most of a rewrite of the app.
- **Keeping pg-boss on Lambda.** A scheduled Lambda could drain the queue every minute, but it would wake the database every minute and keep it awake.
- **Neon.** It is cheaper than Aurora at every size and wakes in under a second, but it is a second vendor. Everything stays on AWS instead.

## Consequences

- The database endpoint is on the internet, guarded by TLS and IAM authentication. A leaked role key would let someone in, so no role key lives outside AWS.
- After a quiet period, the first request waits about 15 s for Aurora to resume, plus a Lambda cold start. Learners will notice that wait. Raising the auto-pause delay shortens how often it happens and costs more.
- Every `Jobs` handler must tolerate being run twice, because SQS delivers at least once.
- This decides the shape the app must have to run on AWS. No deploy is planned yet. Until one is, the stack is checked locally with `alchemy dev`.
- A deploy is not a public release. [licensing.md](../licensing.md) still requires a lawyer's review before the app is shown to people outside the team.
