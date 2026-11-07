# ADR 0001: Serverless AWS stack, defined with Alchemy and Effect

- Status: Accepted
- Date: 2026-11-04

## Context

mojibun is a side project with few Learners and spiky, low traffic. It must cost close to nothing when idle. The application code is written with Effect, and the infrastructure should use the same language and type system. The full stack must run on a laptop without an AWS account.

## Decision

Use pay-per-request managed AWS services:

- CloudFront, through Alchemy's `Website.Router`, as the single front door.
- S3 for the web app and static content.
- Cognito for Learner sign-in.
- One Node.js Lambda for the API, reached through its function URL. See ADR 0003.
- DynamoDB on-demand for Learner state. See ADR 0002.

Define the stack in TypeScript with Alchemy v2 (`alchemy`, `@alchemy.run/aws`), which is built on Effect 4. Write the API function with Effect: `HttpApi` and `Schema` for the contract, services and layers for dependencies. Declare each resource where it is used, and let Alchemy's bindings generate the IAM permissions.

Develop locally with `alchemy dev`. It runs the stack on Alchemy's pinned Floci emulator in Docker, with no AWS account.

Pin `alchemy`, `@alchemy.run/aws` and `effect` to exact versions, because Alchemy v2 is in beta.

## Alternatives considered

- **Containers on ECS Fargate with RDS PostgreSQL.** Rejected because on AWS it bills per hour even when idle, for the load balancer, the database instance and usually a NAT gateway. That is tens of dollars a month for a side project.
- **One small VM or Lightsail instance with PostgreSQL.** This is the cheapest to reason about, and SQL fits the Content Graph naturally. Rejected because it gives up the managed sign-in and the zero-idle-cost scaling. If the project outgrows DynamoDB's access patterns, this is the first alternative to revisit.
- **Aurora Serverless v2.** It can scale to zero, but it resumes slowly on the first request, and the local emulator runs it as a plain PostgreSQL container, so local behavior would not match AWS.

## Consequences

- The idle cost on AWS is close to zero, and there is no server to patch.
- One language and one type system cover the infrastructure, the handlers and the API contract.
- Alchemy owns the emulator's lifecycle and version, so emulator gaps are Alchemy's gaps. Two of them shaped this stack: JWT authorizers (ADR 0003) and function URL origins (see `docs/infrastructure.md`).
- The emulator does not enforce IAM policies by default, so the first real AWS deploy may still find permission gaps.
- Beta APIs may break on upgrade. Upgrade on purpose, then run `npm run typecheck` and `npm run smoke`.
- Lambda cold starts add latency to the first request after an idle period. This is acceptable for a study app.
