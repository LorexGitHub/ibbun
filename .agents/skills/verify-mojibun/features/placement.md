# placement

A logged-in Learner opens Placement, picks a JLPT Level and a Track, and taps the tiles of what they already know (issue #197). "Save" records a `manual` Review for each newly tapped item, which makes it Known. A Known tile is pressed and locked, and a later scheduled Review still checks it.

## Sub-features

- `placement-wall` shows one Track of a level as a wall of tiles (`list "N5 Kanji"`). A Kanji tile is the glyph. Words and Grammar have wider tiles with reading and meaning. Known tiles are pressed and disabled.
- `placement-track` switches between Kanji, Words and Grammar (`group "Track"`). What was tapped stays tapped across Tracks.
- `placement-all` is the button "All of N5 Kanji" above the wall: it presses every tile of the Track that is not Known, and lets them all go on a second press.
- `placement-count` reads "2 to mark as Known · 1 of 30 Known" beside "Save", and stays at the bottom of the window.
- `placement-level` switches between N5 to N1; a level with no content says "No N1 Kanji yet.".
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

- **Wall.** Open `/placement`. Run `verify.sh shot /placement placement/wall`. The ARIA snapshot has a `group "JLPT Level"` with `N5` pressed, a `group "Track"` with `Kanji` pressed, the button `All of N5 Kanji`, and a `list "N5 Kanji"` of buttons, none pressed.
- **Tap and save.** Press the first tile. The count reads `1 to mark as Known`. Press `Save`. The status reads `1 marked as Known.` and that tile is now pressed and disabled.
- **Whole level.** Press `All of N5 Kanji`: every enabled tile is pressed and the count is the number of them. Press it again: none are.
- **Wider tiles.** Press `Words`: the `list "N5 Words"` tiles show label, reading and meaning.
- **Stored value.** Reload `/placement`: the tile is still pressed and disabled. Then `psql "$DATABASE_URL" -c "select kind, passed, detail->>'source' from progress.reviews where learner_id = '<id>'"` shows one row: `manual | t | placement`.
- **Not twice.** Tick the same item through the API again (`curl -X POST` with the session cookie): the answer is `{"recorded":0}` and the row count stays 1.
- **Empty level.** Press `N1` on the fixture. It says `No N1 Kanji yet.` and `Save` is disabled.
- **Slice spec.** Run `pnpm exec playwright test --project=learner slices/placement`. It passes.
- **One level.** Open `/placement?level=n4`: the N4 list loads, and the `group "JLPT Level"` is gone because the "Level filter" in the header holds the levels.

## Gotchas

- Untick is not offered for Known items: once Known, always Known (ADR 0001).
- The `learner` Playwright project exists only once `slices/account/register.ts` does; until then drive the screen by hand.
- Only the N5 fixture has content, so N4 to N1 are empty in dev until the content import (#190) has run.
- Imported items with no Example are Suspended, and `levelList` decides whether they show here.

## Keys

- **Enter** is **Save**, off while nothing is tapped. A focused tile keeps Enter and Space for itself.
- A key never runs while the Learner types in a field (Enter excepted), while a dialog is open, or with Ctrl, Alt or ⌘ held. Each key shows as a small `kbd` mark on its button, hidden on touch screens, and the button carries `aria-keyshortcuts`.
