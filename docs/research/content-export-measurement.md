# Content export to S3: what a guest session stops sending to Aurora

Measured for [#283](https://github.com/LorexGitHub/ibbun/issues/283), per ADR 0017 (PR #286). Method: read every route the API mounts and list what each one touches. Dated 2026-11-14, `origin/main` at 41cba84.

## Finding

Exporting read-only content to S3 would remove the **content reads** from Aurora, but it would **not** let any Learner route run with the database paused. Every Learner route still needs Postgres for something that is not content.

- **The session itself is a database read.** `createLearnerAuth` (`core/learner/src/auth.ts`) resolves a session with Better Auth's `getSession`, and no `cookieCache` is configured. Every route behind `requireLearner()` reads the `sessions` table first.
- **Per-Learner state is on every page.** Mastery, introduced items, preferences and Tracks come from `progress`, `learners` and `learningPath`, all Postgres.

## Routes a guest session hits

| Route | Content reads | Other Postgres reads | Aurora-free after export? |
| --- | --- | --- | --- |
| `GET /api/browse/levels/:level` | levelList x3 | session, progress.items | no |
| `GET /api/browse/search` | search | session | no (session) |
| `GET /api/browse/items/:id` | studyItem, successorOf | session, learningPath.isLocked, progress.introduced | no |
| `GET /api/reading/passages/:id`, `/batch-texts/:id` | readingPassage | session, learners.preferences, progress.items, texts | no |
| `GET /api/reading/episodes` | readingPassage | session, texts | no |
| `POST /api/reading/lookups`, `/api/learn/lookups` | studyItem | session, progress.record (write) | no |
| `GET /api/learn/state`, `PUT /tracks` | none | session, learningPath, learners | no (no content) |
| `GET /api/learn/batch`, `/now/:id` | pathItems, studyItem, clips | session, learningPath, learners, progress | no |
| `POST /api/learn/complete`, `/skip`, `/clip/answer` | studyItem | session, progress writes | no |
| `GET /api/dashboard/today`, `/levels/:level` | levelList x15 | session, progress | no |
| `GET /api/reviews/*`, `/api/cram/*`, `/api/placement/*`, `/api/listening/*` | studyItem, levelList | session, progress | no |
| `GET /api/credits` | credits | none | **yes** (public, no session) |

Of about 50 routes, **one** (`/api/credits`) stops touching Aurora, and Credits is hidden in the showcase stage. Two content-only routes (`search`, `credits`) lose all their content queries, but `search` still reads the session. The content queries removed from the rest are real, but they run in the same request as session and progress reads, so the first request after a pause still wakes Aurora.

## Decision

The issue says to stop if few routes would stop touching Aurora. They are few, so the export is not built here and #283 closes with this record. "Browse and reading work with the database paused" cannot be met by exporting content alone.

## What would make the goal reachable

Each of these is its own issue, and ADR 0017 should be amended if one is picked:

1. **Stateless guest sessions**: a signed cookie that carries the guest's identity, with no `sessions` row, so a read-only route needs no database. Cost: no server-side revocation.
2. **Per-Learner state in the browser for guests** (Browse mastery badges, locks), written to Postgres only on the first write. Cost: a second store, and two code paths.
3. **Accept the wake**: keep Postgres in the path, and export content only to shorten queries. Aurora's awake hours would barely change, because the first request of a visit wakes it either way.

The ADR 0017 cost estimate assumes Browse and reading do not wake Aurora. With this finding the idle estimate (about $5 a month) still holds, since it counts a paused database, but the awake-hours saving the export was meant to bring is small.
