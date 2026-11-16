# ADR 0018: Terraform for the AWS stack

- Status: Accepted
- Date: 2026-11-15

[ADR 0015](0015-serverless-on-aws.md) defined the AWS stack with Alchemy v2 and Effect, in `alchemy.run.ts`. The stack has never been deployed. Getting it this far needed several workarounds, and the first real deploy would add more:

- Alchemy is a beta (2.0.0-beta.85). Two of its bugs break it on Windows, and one is patched only in this checkout's `node_modules`.
- Its Aurora parameter group has no `parameters`, so `rds.force_ssl` goes through a CloudControl resource that has never run.
- Its `Website.Router` cannot lock the API's function URL to CloudFront or forward `CloudFront-Viewer-Address`. [PR #272](https://github.com/LorexGitHub/ibbun/pull/272) needs both, which means writing our own CloudFront distribution anyway.

The stack moves to Terraform with the `hashicorp/aws` provider. That provider covers every resource in ADR 0015 and ADR 0017 directly. The stack's shape stays the same: the same services, the same showcase and full stages, the same budget alert.

## What changes

- The stack lives in `infra/` as Terraform. Each stage (`showcase`, `prod`) has its own state, kept in an S3 bucket in the account with S3 state locking.
- The region is eu-north-1, where the AWS project was created. It replaces eu-central-1 in ADR 0015 and ADR 0017. The prices that dominate the bill are the same in both regions: Aurora Serverless v2 at $0.14 per ACU-hour and a public IPv4 address at $0.005 an hour.
- The app code does not change. Only `alchemy.run.ts` and `scripts/infra/` used Alchemy.
- Builds stay in Node scripts: the API bundle, the web app, and the worker's container image. Terraform only takes their outputs.
- The worker's schedules are still read from the slices. A script writes them to a JSON file, and Terraform reads that file.
- Alchemy and Effect's `Config` leave the infrastructure once the Terraform stack can deploy both stages.

## Considered Options

- **Keep Alchemy.** It keeps `alchemy dev` and the stack in TypeScript, but the first deploy would run on a beta that has never deployed this stack, with workarounds that have never run.
- **AWS CDK.** It is TypeScript and mature, but every deploy goes through CloudFormation stacks, which are slower to change and harder to read when something fails.
- **OpenTofu.** It is the same language and nearly the same tool. Terraform has the wider tooling, including AWS's own agent toolkit. Moving between the two later is cheap.

## Consequences

- `alchemy dev` and its emulator are gone. Locally the app runs on `docker compose`, which ADR 0015 already judged closer to production. The smoke test in `scripts/infra/tests/smoke.mjs` runs against a deployed stage instead.
- `terraform plan` shows every change before it is made. That makes the first deploy, and every one after it, reviewable.
- The state bucket must exist before the first `terraform init`. Creating it is a one-time step in the account.
