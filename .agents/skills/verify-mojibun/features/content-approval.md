# content-approval

Not built yet. The `content-approval` slice ([architecture.md](../../../../docs/architecture.md#slices)) has no journeys to verify. Its author fills this file with `/maintain-verification-skill` in the slice PR.

## Sub-features

## How to get to it (user POV)

## Driving it with Playwright

Preconditions:

## Gotchas

- `level disagreement` entries come from the derived-level process in core `content-graph/levels`, not from this slice: one per Study Item whose approved List candidate differs from its current level, with `detail` `{list, current}`. Resolving one does not re-queue it.
