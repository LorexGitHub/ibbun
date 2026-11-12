# cram

Cram lets a Learner choose Study Items, including ones still Locked, and practise them one Example at a time. Answers are graded by `grade()` and logged as `cram` Reviews, so Mastery, the schedule and statistics stay exactly as they were. Screen: `/cram`. API: `/api/cram`.

## Sub-features

- `cram-choose` is a picker with a basket. One joined row holds three choosers (**Level**, **Type**, **Mastery**) and the **Search** field. A chooser lists again at once; the search looks through every level on Enter. The list "Study Items" is its own scrolling window (`.cram-list`, fixed height) of a level's Kanji, Words and Grammar Points, Locked or not, each with a tick box and the Learner's Mastery (New for anything not yet taught). The level starts at the one in the address (`/cram?level=n3`) and follows the header's level filter.
- `cram-basket` is the `complementary` landmark "Basket" on the right: the count, each chosen item with a **Remove** button, **Practise n items** and **Clear**. It keeps its items while the list changes. **Choose all shown** adds the whole list. A search or level with no result reads "Nothing matches. Try another level, type or search word, or look it up in the Library." with the link **Open the Library** to `/browse`.
- `cram-practise` asks each chosen item once, blanking the target (highlighting it for a Kanji), with a hint on request, retries for empty input, Latin letters and alternates, and Show answer as a fail.
- `cram-log` stores each graded answer as a `cram` Review with its facets, attempts, hints and time, and nothing else.
- `cram-untouched` leaves Mastery, Known, Introduced and due dates unchanged.

## How to get to it (user POV)

- Log in, then click **Cram** in the nav, or open `http://localhost:5173/cram`.
- From the end of a review session with a failed Review, click **Cram the Lapses**. It opens `/cram?items=<id>,<id>` and practice starts on those Study Items with no chooser.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports every line `ok`.
- The N5 fixture is loaded (`DATABASE_URL=<verify db url> pnpm --filter @mojibun/content-graph seed:fixture`).
- A verified Learner is logged in (account slice) with no Reviews.

- **Choose.** Open `/cram`. `verify.sh shot /cram cram/choose`. The aria snapshot lists a `Study Items` list with checkboxes and a disabled `Practise 0 items` button. Click `Choose all shown`; the button reads `Practise 30 items` or the count of the filtered list.
- **Locked items.** Pick a Word the Learner never learned. It is listed and practisable.
- **Practise.** Click `Practise N items`. `1 of N` appears with a sentence containing `＿＿＿`. Type the answer in the textbox, click `Check`; `Right.` or `Not quite.` shows. Click `Next`; `2 of N` appears.
- **Retry.** Type `q` and click `Check`: a message appears and nothing is saved.
- **Show answer.** Click `Show answer`: `Not quite.` and `Answer: …`.
- **From a link.** Open `/cram?items=<a Study Item id>`: `1 of 1` shows at once and no `Practise` button. An id that is not a Study Item id is dropped; with none left the chooser shows. After **Choose more** the chooser shows.
- **Finish.** After the last item, `x of N right. Mastery and statistics are unchanged.` shows.
- **Stored value.** `docker compose -p mojibun-verify exec postgres psql -U mojibun -c "select kind, passed from progress.review order by at"` lists only `cram` rows for the answers given (check the table name with `\dt progress.*`).
- **Mastery untouched.** The Learner's dashboard (or `psql` count of rows whose kind is `srs`, `manual` or `learn`) shows no change.
- **Slice spec.** `env -u CI pnpm exec playwright test --project=learner slices/cram/tests` passes.

## Gotchas

- A Study Item with no approved Example (or a Listening Clip) is skipped and named at the end.
- Kanji ask two facets (reading in the Sentence, English meaning); both must pass.

## Keys

- The first answer field has the cursor. **Enter** is Check, then Next, and Choose more on the summary. Show answer has no key.
- A key never runs while the Learner types in a field (Enter excepted), while a dialog is open, or with Ctrl, Alt or ⌘ held. Each key shows as a small `kbd` mark on its button, hidden on touch screens, and the button carries `aria-keyshortcuts`.
