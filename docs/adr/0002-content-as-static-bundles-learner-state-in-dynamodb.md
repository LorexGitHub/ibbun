# ADR 0002: Content Graph as static bundles, Learner state in DynamoDB

- Status: Accepted
- Date: 2026-11-03

## Context

mojibun has two kinds of data with different shapes. `CONTEXT.md` defines the terms used here.

- **The Content Graph** holds the Study Items and Sentences, plus the typed links between them. It is the same for every Learner. It changes only when content is imported or passes Content Approval, so it is read constantly and written rarely. Its queries follow links, such as the Kanji in a Word or the Sentences that demonstrate a Grammar Point.
- **Learner state** holds Known flags, Reviews and Mastery. It belongs to one Learner, and every write comes from that Learner. Reads and writes never cross Learners.

## Decision

- **The Content Graph is built ahead of time.** A content build step turns the source datasets and approved generated content into JSON bundles. It splits them by JLPT Level and Study Item kind, and it stores links as denormalized fields. The bundles live in the `content` bucket and are served through CloudFront. The browser fetches and caches them, and the API never queries content.
- **Learner state goes in one DynamoDB table.** The partition key is the Learner, so each Learner's data is one partition. `docs/infrastructure.md` documents the keys. Reviews are stored append-only, and Mastery is kept as a cached summary next to them.

## Alternatives considered

- **Both kinds of data in PostgreSQL.** This is the most flexible option, and link-following is natural in SQL. Rejected for now because it needs a database server that bills while idle (see ADR 0001), and because the app never has to join content to Learner state on the server. The client can do that join for one Learner.
- **The Content Graph in DynamoDB as well.** This works, but it adds read costs and modelling effort for data that changes only at release time. Static files are cheaper and cache at the edge.

## Consequences

- Content reads cost CloudFront and S3 requests only, and they work offline once cached.
- Changing content means running the build and uploading the result. Content Approval becomes a gate in that pipeline, not a runtime feature.
- Server-side queries across content and Learners are not possible. One example is "Learners who know every N5 Kanji in this Reading Passage". If such features matter later, add a read model, or revisit PostgreSQL.
- Because the full Review history is kept, you can recompute Mastery whenever the Learning Path or scoring rules change.
