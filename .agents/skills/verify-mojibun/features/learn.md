# learn

The `learn` slice (`slices/learn`): the Active Track grid, a batch of New Study Items, a lesson for each, and the quiz that must be answered fully correctly. Passing the quiz appends a Review of `kind` `learn` per item, so the items go into Reviews. **I know this** appends a `manual` Review with `source` `learn-skip`. Listening Clips are not taught here yet.

## Sub-features

- `learn-grid` shows the Active Track grid at `/learn`: one checkbox per level (N5 to N1, Unlevelled) and type (Kanji, Words, Grammar). Toggling saves at once through `PUT /api/learn/tracks` and loads the batch again. Listening Tracks are not in the grid and are kept as they were.
- `learn-batch` takes the batch from `learning-path.next()`: at most the Learner's `batchSize`, and at most what is left of `dailyBudget` (counted over the UTC day, from `learn` and `learn-skip` Reviews). Pulled-in dependencies come on top. `GET /api/learn/batch` returns it with the lessons, the quiz questions and `remaining`. An empty batch reads "You have used the budget for new items today" or "Nothing new is left in your active Tracks".
- `learn-lesson` teaches one Study Item at a time (title, reading, meanings, details, Japanese Explanation, one Example) with **Next**, and **Start quiz** on the last.
- `learn-quiz` asks each item through its first approved Example: a cloze for a Word or Grammar Point, a reading and a meaning facet for a Kanji. The Learner's try is graded in the browser with `grade()`. A miss shows the answer and is asked again later; the quiz ends when every item has been answered right. The same try rules as Reviews apply: an empty try, leftover Latin letters or an alternate's nudge are not graded and are kept as `attempts`.
- `learn-record` sends the correct answers to `POST /api/learn/complete`. The API grades them again from the stored answer data, and stores nothing unless every answer passes (422). Then it appends one `learn` Review per item with `exampleId`, per-facet input and outcome, `attempts[]` and `timeToAnswerMs`.
- `learn-skip` records **I know this** through `POST /api/learn/skip` and drops the item from the lessons and the quiz. It counts against the day's budget.
- `learn-now` (`slices/learn/learn-now`) opens `/learn?now=<study item id>`, which is where Browse's **Learn now** button goes. `GET /api/learn/now/:id` returns the item and its pulled-in dependencies from `learning-path.forItem()` as a batch, locked or not, whatever is left of the budget. The same lessons and quiz run; the screen sends `now: true` to `/complete` and `/skip`, so the Reviews carry `detail.source = 'learn-now'` and the daily budget does not count them. The item is introduced, so its Track skips it later.

## How to get to it (user POV)

- Log in, pick **Learn** in the nav, or open `http://localhost:5173/learn`. The Today screen's **Learn new** button goes there too.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports every line `ok`; the N5 fixture is loaded (`content-graph-fixture.md`) and a verified Learner is logged in (`account.md`).
- For a clean run use a Learner with no Reviews.

- **Grid.** Open `/learn`. `shot /learn learn/grid` shows the grid with the four N5 Tracks of Kanji, Words and Grammar ticked, "0 of 15 new items learned today" and **Start batch**. Untick `N5 Words` and the batch line changes.
- **Lesson.** Press **Start batch**. The screen reads "Lesson 1 of N", with the title, meanings and one Example. **Next** moves on; the last lesson offers **Start quiz**.
- **Quiz miss.** Answer a question wrong and press **Check**. The status reads "Not quite" with the accepted answer; press **Next**. The "N left" count does not drop and the same question comes round again. Nothing is in `progress.reviews` yet.
- **Quiz pass.** Answer every question right. The screen returns to the grid with "N new items are in your Reviews." Check: `psql "$DATABASE_URL" -c "select kind, passed, detail->>'exampleId' from progress.reviews where learner_id = '<id>' order by seq"` shows one `learn | t | <example id>` row per item. Open `/reviews` after the first interval and the items are due.
- **I know this.** On a lesson press **I know this**. The item leaves the batch and a `manual | t` row with `detail->>'source' = 'learn-skip'` appears. The learned-today count goes up.
- **Budget.** Set `daily_budget` to the number just learned (`/api/learner/preferences`, or in `learner.preferences`). Reload `/learn`: "You have used the budget for new items today. Come back tomorrow." and no **Start batch**.
- **Forged pass.** `curl -s -X POST -b <session cookie> -H 'content-type: application/json' -d '{"answers":[{"studyItemId":"<id>","exampleId":"<example>","facets":[{"facet":"cloze","input":"zzz"}]}]}' http://localhost:3000/api/learn/complete` prints a 422 message and `progress.reviews` gains no row.
- **Learn now.** Open a locked item in Browse (`/browse`) and press **Learn now**; the URL is `/learn?now=<id>` and the screen reads "Lesson 1 of N" with no grid. Pass the quiz. Check: `psql "$DATABASE_URL" -c "select kind, passed, detail->>'source' from progress.reviews where learner_id = '<id>' order by seq"` shows `learn | t | learn-now` rows, and `/learn` still reads the same "N of M new items learned today". With the budget used up the button still works. `curl -s -b <cookie> http://localhost:3000/api/learn/now/<id>` returns the batch (404 for an unknown id, 400 for a malformed one).
- **Spec.** `pnpm exec playwright test --project=learner slices/learn/tests` passes.

## Gotchas

- The `learner` Playwright project exists only once `slices/account/register.ts` does.
- The batch is not stored. Reloading `/learn` before the quiz is passed returns the same items, because nothing is introduced until the quiz passes or **I know this** is pressed.
- The day for the budget is the UTC day, as on the Today screen.
- Learn now Reviews are `learn` Reviews with `source: learn-now`; only the budget ignores them. Reviews and the Learning Path treat the item as introduced.
- A Word in the batch pulls its Kanji into the same batch, so a batch can be longer than `batchSize`.
