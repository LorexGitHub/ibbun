# placement

A logged-in Learner opens Placement, picks a JLPT Level, and ticks the Kanji, Words and Grammar Points they already know. Submitting records a `manual` Review for each newly ticked item, which makes it Known. A Known item shows ticked and locked, and a later scheduled Review still checks it.

## Sub-features

- `placement-list` shows a level's Kanji, Words and Grammar Points in groups, with Known items ticked and locked.
- `placement-level` switches between N5 to N1; a level with no content shows an empty list.
- `placement-submit` records one `manual` Review (`source: placement`) per newly ticked item, in one transaction, and reports how many.
- `placement-guard` answers 401 without a session, 404 for an unknown level, 400 for an empty batch or an item not on the level.
- `placement-recheck` leaves each placed item scheduled: it comes due for a normal Review later.

## How to get to it (user POV)

- Log in, then choose **Placement** in the nav, or open `http://localhost:5173/placement`.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports every line `ok`.
- The N5 fixture is loaded: `DATABASE_URL=<verify db url> pnpm --filter @mojibun/content-graph seed:fixture`.
- A verified Learner exists and is logged in (account slice).

- **List.** Open `/placement`. Run `verify.sh shot /placement placement/list`. The ARIA snapshot has a `group "JLPT Level"` with five buttons, `N5` pressed, and 30 checkboxes under Kanji, Words and Grammar, none checked.
- **Tick and submit.** Check the first checkbox and press `Mark 1 as Known`. The status reads `1 marked as Known.` and that checkbox is now checked and disabled, with a `Known` pill.
- **Stored value.** Reload `/placement`: the item is still checked and disabled. Then `psql "$DATABASE_URL" -c "select kind, passed, detail->>'source' from progress.reviews where learner_id = '<id>'"` shows one row: `manual | t | placement`.
- **Not twice.** Tick the same item through the API again (`curl -X POST` with the session cookie): the answer is `{"recorded":0}` and the row count stays 1.
- **Empty level.** Press `N1`. The list is empty and the submit button is disabled.
- **Slice spec.** Run `pnpm exec playwright test --project=learner slices/placement`. It passes.

## Gotchas

- Untick is not offered for Known items: once Known, always Known (ADR 0001).
- The `learner` Playwright project exists only once `slices/account/register.ts` does; until then drive the screen by hand.
- Only the N5 fixture has content, so N4 to N1 are empty in dev.
