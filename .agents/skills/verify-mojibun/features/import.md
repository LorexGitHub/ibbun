# import

Not built yet. The `import` slice ([architecture.md](../../../../docs/architecture.md#slices)) has no journeys to verify. Its author fills this file with `/maintain-verification-skill` in the slice PR.

## Sub-features

- **Apply a refresh** (core, built): `content-graph/authoring.applySnapshot(dataset, run, records)` for `jmdict`, `kanjidic` and `tatoeba`. New, changed and gone keys; successor detection with **superseded by**; sense matching; overrides re-applied, Stale or Orphaned; Tatoeba Examples moved or redrafted; circuit breaker; Import Run counts. The slice's journeys (schedule, stage, diff, report screen) are not built yet.

## How to get to it (user POV)

## Driving it with Playwright

Preconditions:

## Gotchas

- Until the slice ships, `applySnapshot` has no screen or route to drive. Its proof is `npx vitest run core/content-graph/src/authoring/snapshot` (fake and real Postgres). After a run, read `content_graph.import_run` (status, counts) and `content_graph.queue_entry` filtered by `import_run_id` with `psql`.
- A run that trips the breaker leaves only an `import_run` row with status `breaker tripped` and one `breaker tripped` queue entry; every other table is unchanged.
