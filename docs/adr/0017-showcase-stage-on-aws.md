# A showcase stage on AWS

[ADR 0015](0015-serverless-on-aws.md) defines the whole app as an AWS stack: API, worker, jobs, Sudachi, VOICEVOX, imports, mail. The first deploy has a hard budget of €20 a month, and mojibun is a showcase that mostly sits idle. Most of that stack exists to run work that no Learner needs while they study.

A Learner's own requests touch only the API, Postgres and audio. Three actions reach anything else: a Batch Text after a Learn batch, a reading Practice Text and a listening Practice Text. Every other job, such as content generation, review, Content Approval and imports, is Supervisor work.

The first deploy is a **showcase stage** that runs the Learner side only. The Supervisor side runs on the Supervisor's machine with `docker compose`, as it does today.

## What the showcase stage deploys

CloudFront, three S3 buckets (web app, audio, exported content), one API Lambda, Aurora Serverless v2 in the default VPC's public subnets, and SSM for `AUTH_SECRET`. It has no queue, worker, Scheduler entries, container images, Fargate task, SES or custom domain. The code for those stays in the repo, and a full stage can still deploy it.

## What the app does differently

- **`SHOWCASE=1` turns off the actions that cost money per Learner.** Batch Texts and Practice Texts show "not available in this showcase" and queue nothing. The Supervisor pages and Credits are hidden. Nothing calls Claude from AWS, so `ANTHROPIC_API_KEY` never goes there.
- **A guest login replaces open sign-up.** "Try it" creates a throwaway Learner with no email, so the stage needs no SES and no verification. A guest request deletes guests older than a set age, so the stage needs no Scheduler. This replaces [ADR 0012](0012-open-sign-up-bounded-by-token-quotas.md) for the showcase stage. ADR 0012 still holds for any stage with sign-up.
- **Read-only content is served from S3.** Levels, Words, Kanji, Grammar Points and Reading Passages change only at an import or an Approval Decision. They are exported as static JSON, cached by CloudFront, and the API reads Postgres only for per-Learner state. Browsing and reading then don't wake Aurora.
- **The Supervisor publishes from their machine.** A command copies approved content to Aurora and the generated audio to S3.

## Cost

Estimated, not measured. The prices are the eu-central-1 list prices behind `scripts/cost-model.mjs`.

| Item | Per month |
| --- | --- |
| Public IPv4 address for Aurora | about $3.65, paused or not |
| Aurora storage, 1.6 GB | about $0.20 |
| S3 and CloudFront | under $1, inside the always-free allowances at this size |
| Aurora while awake | $0.14 an hour |

Idle cost is about $5. Aurora's awake hours are the only cost that grows with use, and the content export is there to keep them low. There is no Claude cost on AWS, and none from Learners, because their Claude features are off. The Supervisor's own generation cost is separate; it moves to the Message Batches API, with prompt caching and a cheaper model for simple steps. A budget alert at $10 comes first, well before the $20 limit pauses the project.

## Considered Options

- **Deploy the full ADR 0015 stack.** It costs more to set up and to run, and no showcase visitor needs the extra work it does.
- **A shared demo account.** It is the simplest, but visitors would see each other's progress.
- **Aurora DSQL.** It could bring the database near zero, but the schema's foreign keys and the migration runner's advisory lock don't work on it. It stays a later option if Aurora is still the largest cost.
- **Keep Batch Texts on, with a daily cap.** It is the best demo, but it needs the queue, the worker, a Claude key on AWS and a daily spend limit, for one feature.

## Consequences

- A visitor sees the Learner side only. Batch Texts, Practice Texts and the Supervisor tools can't be tried in the showcase.
- Anyone can create guest rows in the database, so guest creation is rate limited.
- The first request after Aurora pauses waits about 15 s, as in ADR 0015. A guest's first click is the likeliest one to hit it.
- Content in the showcase is as fresh as the last publish. A new import or Approval Decision reaches it only when the Supervisor publishes.
- The pieces ADR 0015 built and this stage doesn't deploy are tested only by `alchemy dev`, not by a real deploy.
