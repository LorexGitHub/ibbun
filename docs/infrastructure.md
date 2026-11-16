# Infrastructure

The AWS stack is Terraform, in `infra/` ([ADR 0018](adr/0018-terraform-for-the-aws-stack.md)). It replaced the Alchemy stack of [ADR 0015](adr/0015-serverless-on-aws.md), whose history is in git. Only the showcase stage ([ADR 0017](adr/0017-showcase-stage-on-aws.md)) is ported so far; the full stage's jobs side (queue, worker, Scheduler entries, Sudachi and VOICEVOX functions, imports, SES) is not.

## Layout

| Path | What it holds |
| --- | --- |
| `infra/bootstrap` | The S3 bucket for every stage's Terraform state. Applied once by hand, with local state. |
| `infra/showcase` | The showcase stage. Its state is `showcase/terraform.tfstate` in that bucket, locked with an S3 lock file. |
| `infra/modules/database` | Aurora Serverless v2 for PostgreSQL, in the default VPC, with IAM authentication. |
| `infra/modules/storage` | The web and audio buckets. |
| `infra/modules/api` | The API Lambda, its `AWS_IAM` function URL, its role, and the `AUTH_SECRET` SSM parameter. |
| `infra/modules/cdn` | CloudFront: the web bucket by default, `/api/*` to the function URL (signed with origin access control), `/audio/*` to the audio bucket, and the viewer-IP and single-page functions. |

The region is eu-north-1. Terraform takes the API bundle and the web build as inputs; Node scripts in `scripts/infra/` make them.

## Deploy the showcase stage

From the repository root, with AWS credentials for the project in the environment:

```sh
pnpm stack:build:api                  # bundles apps/api/src/lambda.ts into apps/api/dist/lambda
cd infra/showcase
terraform init
terraform plan                        # read it before applying
terraform apply
cd ../..
pnpm stack:deploy:web                 # builds the web app in showcase mode, uploads it, invalidates index.html
```

`stack:deploy:web` reads the bucket and distribution from `terraform output` in `infra/showcase`. The browser reads `SHOWCASE=1` at build time, which the script sets.

Run `pnpm db:migrate` against Aurora with the owner's password (the SSM parameter named by the database module's `master_password_parameter` output) before the first request, and publish the content ([#284](https://github.com/LorexGitHub/ibbun/issues/284)); the database is empty until then. Open Cost Explorer after the first day.

To remove the stage, run `terraform destroy` in `infra/showcase`.

## Run the app locally

Locally the app runs on `docker compose`, not on AWS. See [getting-started](getting-started.md).

## Scripts in `scripts/infra/`

- `build-function.mjs` and `bundle.mjs`: bundle the API (and the worker's zip) for Lambda.
- `build.mjs` and `deploy-web.mjs`: build and upload the web app.
- `schedules.mjs` and `cron.ts`: read the worker's schedules from the slices and turn them into EventBridge cron expressions. The full stage will use them.
