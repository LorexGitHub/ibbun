# content-graph fixture

The hand-made N5 fixture graph (#58): 10 Kanji, 10 Words and 10 Grammar Points, mojibun-owned (licence `mojibun`, Provenance `fixture`), each with two approved Examples. Learners meet it through every reading slice in dev; it has no screen of its own.

## Sub-features

- `loadN5Fixture` loads it through `content-graph/authoring`; a second load does nothing.
- It refuses to load when `NODE_ENV=production`.
- `n5Fixture()` from `@mojibun/content-graph/testing` gives the same rows to the in-memory fake.

## How to get to it (user POV)

Not user-facing. Load it into the dev database, then open any slice that reads the Content Graph (browse, learn) once those are built.

## Driving it with Playwright

Preconditions: the stack is up (`verify.sh up`) and migrations have run.

- Load: `DATABASE_URL=<verify db url> pnpm --filter @mojibun/content-graph seed:fixture` prints `N5 fixture: 30 Study Items loaded`; run again, it prints `already loaded`.
- Stored value: `psql "$DATABASE_URL" -c "select type, count(*) from content_graph.study_item where provenance_id = '00000058-0000-7000-8000-000000000000' group by type"` shows 10 each of `kanji`, `word`, `grammar_point`.
- Refusal: `NODE_ENV=production DATABASE_URL=… pnpm --filter @mojibun/content-graph seed:fixture` exits non-zero with "refused in production" and the count above is unchanged.

## Gotchas

- Fixture ids are fixed (`00000058-…`), so the load is idempotent by its Provenance row, not by content.
- Sentences carry no Sudachi tokens, so Dictation cannot be graded against fixture Sentences.
