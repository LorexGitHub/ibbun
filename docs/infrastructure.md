# Infrastructure

`alchemy.run.ts` is the one [Alchemy](https://alchemy.run) v2 and [Effect](https://effect.website) stack for everything ADR 0015 puts on AWS, and ADR 0017 leaves out of the showcase stage. **Nothing has been deployed.** `alchemy dev` brings the stack up on Alchemy's local AWS emulator (a fork of [Floci](https://github.com/floci-io/floci) in Docker), with Compose's Postgres in place of Aurora. No AWS account is needed.

## What the stack defines

| Part | Resources | Showcase stage | Full stage |
| --- | --- | --- | --- |
| Front door | CloudFront (`Website.Router`): the web bucket by default, `/api/*` to the API function URL, `/audio/*` to the audio bucket, `/content/*` to the content bucket | yes | yes |
| Web app | `Website.StaticSite` of `apps/web/dist`, with a single-page fallback | yes | yes |
| API | Lambda (Node 24, arm64), bundled from `apps/api/src/lambda.ts`, function URL | yes | yes |
| Buckets | web, audio, content | yes | yes, plus a private bucket for raw import files |
| Database | Aurora Serverless v2 for PostgreSQL 17: auto-pause after 5 idle minutes, public, `rds.force_ssl`, IAM authentication, in a VPC of public subnets only | yes | yes |
| Secrets | SSM parameters: `AUTH_SECRET`, `ANTHROPIC_API_KEY` (full stage only), `APP_URL` | yes | yes |
| Alert | an AWS Budgets alert at $10 a month | yes | yes |
| Jobs | the queue, its dead-letter queue (3 receives), the worker Lambda (container image) with its SQS trigger, one EventBridge Scheduler entry per scheduled job | no | yes |
| Dead-letter alarm | CloudWatch alarm on the dead-letter queue's depth, to an SNS topic with an email subscription | no | yes |
| Containers | Sudachi and VOICEVOX as Lambda container images with `AWS_IAM` function URLs | no | yes |
| Imports | an ECS cluster and a Fargate task definition for JMdict and Tatoeba, started by the worker | no | yes |
| Mail | an SES identity; `MAIL_TRANSPORT=ses` | no | yes |

A stage named `showcase` is the showcase stage. Any other name gets everything: `prod` is the shared stage, and each developer's `alchemy dev` stage is `dev_<user>`. `scripts/infra/stage.ts` holds the rule.

`APP_URL` is an SSM parameter, not an environment variable, because CloudFront's URL depends on the API function's URL. The function reads every parameter under `SSM_PARAMETER_PATH` at cold start, so no cycle appears.

The worker's schedules are read from the slices at stack time (`scripts/infra/schedules.mjs` runs `startWorker` with a recording `Jobs`), so a new `schedule` on a handler becomes a Scheduler entry on the next deploy. `scripts/infra/cron.ts` turns the five-field Unix cron into Scheduler's expression.

## Run it locally

Needs Node 24, pnpm, Docker. From the repository root:

```sh
pnpm install
docker compose up -d postgres mailpit sudachi voicevox      # the stand-ins for Aurora, SES, the Sudachi and VOICEVOX functions
pnpm db:migrate && pnpm --filter @ibbun/content-graph seed:fixture
node scripts/infra/build.mjs                                # builds apps/web/dist
pnpm exec alchemy dev                                       # leave it running; it redeploys when a file changes
```

Set `POSTGRES_PORT` (and `MAILPIT_SMTP_PORT`) when Compose maps them elsewhere. The router is at `http://localhost:9500`. `alchemy dev --stage showcase` brings up only the showcase stage's parts. Build the web app for it with `SHOWCASE=1 node scripts/infra/build.mjs`: the browser reads the setting at build time, and the API function gets `SHOWCASE=1` from the stack.

The smoke test, in a second terminal:

```sh
DATABASE_URL=postgres://ibbun:ibbun@localhost:5432/ibbun node scripts/infra/tests/smoke.mjs
```

It signs up through the router and reads the verification mail in Mailpit, logs in, answers a Learn batch from its quiz data, queues a Batch Text and waits for the worker Lambda to write it (Claude is stubbed by a local HTTP server the script starts), then queues `listening.synthesise` and plays the audio through `/audio/*`.

## What the emulator ran, and what it cannot

Checked on 2026-11-14 with Alchemy 2.0.0-beta.85 and its emulator image `ghcr.io/alchemy-run/floci:2.1.0-alchemy.3`, on Windows 10 with Docker Desktop.

**Ran.** The full stage came up and the smoke test passed: the web app and a client route through the router, the API Lambda reading its secrets and `APP_URL` from SSM, sign-up and the mailed link, login, a Learn batch and its quiz, a job through SQS into the worker Lambda and on to Claude, VOICEVOX and the audio bucket, and the audio back through `/audio/*`. The VPC, subnets, route table, the queue pair, the Scheduler entries, the alarm, the SNS topic and the IAM roles were also created. The showcase stage came up alone (27 resources, router on port 9501) and answered `/api/health`.

**The emulator cannot run:**

- **Aurora.** Its RDS is SQLite behind the Postgres wire protocol. The stack uses Compose's Postgres, reached as `host.docker.internal`, and the `ibbun_app` role from the app-role migration. IAM tokens, TLS and auto-pause are not exercised.
- **Container-image functions.** Docker Desktop on Windows cannot push to the emulator's ECR registry (`*.dkr.ecr.us-east-1.localhost` does not resolve), so the worker, Sudachi, VOICEVOX and the import task's image never start. Locally the worker is the same handler (`apps/worker/src/lambda.ts`) bundled as a zip, and the worker calls Compose's Sudachi and VOICEVOX. A Linux host may run the images: set `IBBUN_EMULATE_IMAGES=1` for Sudachi and VOICEVOX. That was not tried.
- **The Fargate import task.** The stack defines it only off the emulator, because it needs the same image push. Locally every import runs in the worker, as `IMPORT_TASK_CLUSTER` unset means.
- **AWS Budgets and SES.** Both are declared only off the emulator.
- **CloudFront as AWS runs it.** The emulator's router only reaches `localhost:<port>` origins, so locally `/api/*` goes to the emulator's path-style function URL (`/lambda-url/<id>/`, with `<id>` derived from the function name). On AWS the router uses the function URL.

**Untested, so a deploy must check each.**

- Everything above, on real AWS. No `alchemy deploy` has run, and a real deploy keeps its state in the AWS account with `AWS.state()`, while `alchemy dev` keeps `localState()`.
- The router sends the API function URL **unauthenticated** (`authType: NONE`), and CloudFront's origin request policy is the Router's `AllViewerExceptHostHeader`, which does not forward `CloudFront-Viewer-Address`. The API's per-IP rate limits read that header, so without it they have nothing to limit on. Locking the function URL to CloudFront with OAC and forwarding the header needs a `CloudFront.Distribution` of our own in place of `Website.Router`. [PR #272](https://github.com/LorexGitHub/ibbun/pull/272) asks for both.
- `rds.force_ssl` is set through a CloudControl resource (`AWS::RDS::DBClusterParameterGroup`), because Alchemy's `DBClusterParameterGroup` has no `parameters`. It has never run, and neither has the auto-pause setting `SecondsUntilAutoPause`.
- Nothing runs the migrations on Aurora. They need the master user, whose password RDS keeps in Secrets Manager (`pnpm db:migrate` with that `DATABASE_URL`), before the first request.
- The worker's ECR image builds for `linux/arm64`. Its SQS trigger sets `MaximumConcurrency` 5 beside reserved concurrency 5 and `ReportBatchItemFailures`.
- The dead-letter alarm and the Budgets alert mail `IBBUN_ALERT_EMAIL`. SNS asks that address to confirm the subscription, and until it does the alarm reaches nobody.
- A deploy reads `IBBUN_AUTH_SECRET`, `IBBUN_ANTHROPIC_API_KEY`, `IBBUN_MAIL_DOMAIN`, `IBBUN_ALERT_EMAIL` and `IBBUN_VOICE_ALLOW_LIST` from the environment.
- The SES identity is a domain with DKIM; its DNS records and the move out of the SES sandbox are not in the stack.

**What the smoke test found about the app, not the stack.**

- The generated Batch Text stays a draft. `content.review` fails with `no rubric for Generation Request kind "batch-text"`, so `GET /api/learn/batch-text` keeps answering `preparing`. The smoke test checks the row the worker wrote, not what the Learner sees.
- A bundled function cannot load `opusscript` (it reads its WebAssembly from `__dirname`), so the zip worker installs it beside the bundle. The container image has no bundle and is unaffected.

## Deploy the showcase stage

Not done yet. Each step is checked before the next, and each one that needs the AWS account is yours to run.

1. **Account.** One project in `eu-central-1` with a €20 monthly spend limit, MFA on the root user, and a day-to-day IAM user. Add a Budgets email alert at about €10 in the console as well, because the stack's own alert exists only once the stack is deployed.
2. **Credentials.** `pnpm exec alchemy profile edit --add AWS` and pick console login, SSO or stored keys. In CI, set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`. Never commit keys.
3. **Environment.** Export `IBBUN_AUTH_SECRET` (32 bytes or more) and `IBBUN_ALERT_EMAIL`. The showcase stage needs no Anthropic key, mail domain or voice allow list.
4. **State.** A deploy keeps its state in a DynamoDB table in the account, created on the first run. In CI, create it once with `pnpm exec alchemy state bootstrap --backend aws`.
5. **Build.** `SHOWCASE=1 node scripts/infra/build.mjs`, because the browser reads the setting at build time.
6. **Deploy.** `pnpm exec alchemy deploy --stage showcase`. Expect failures on the first run: the untested items above are the likely causes. Fix them in the stack, then run it again; a deploy picks up where it stopped.
7. **Migrate.** Run `pnpm db:migrate` against Aurora with the owner's password from Secrets Manager.
8. **Fill.** Publish the content ([#284](https://github.com/LorexGitHub/ibbun/issues/284)). The database is empty until then.
9. **Look at the bill.** Open Cost Explorer after the first day, before the first visitor.

To remove a stage, `pnpm exec alchemy destroy`. The CLI reference decides whether it takes `--stage`, so check it before running it against a stage you want to keep.

## Windows notes

Alchemy beta.85 has two bugs that bite on Windows, and one is patched in this checkout's `node_modules` only: `build.install` runs `npm` without a shell (`spawn npm` fails), and a function with `bundle: false` slices its directory at `/` and gets nothing from a path with backslashes. The stack therefore bundles the API and the zip worker with Alchemy's own bundler and `build.install`, and `npm` needs `shell: true` for `alchemy dev` to get past the install. The worker's Docker build, the web build and the rest work as they are.
