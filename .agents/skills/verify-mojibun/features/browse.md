# browse

Not built yet. The `browse` slice ([architecture.md](../../../../docs/architecture.md#slices)) has no journeys to verify. Its author fills this file with `/maintain-verification-skill` in the slice PR.

## Sub-features

## How to get to it (user POV)

## Driving it with Playwright

Preconditions:

## Gotchas

- Levels shown on a page are the current JLPT Level from core `content-graph/levels` (Editorial > List > Derived, else Unlevelled). To check a page's level against the store: `psql "$DATABASE_URL" -c "select level from content_graph.computed_level where record_id = '<study item id>'"`. Sentence, Reading Passage and Listening Clip levels sit in the same table, keyed by their own id.
