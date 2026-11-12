# browse

Where a logged-in Learner reads about Study Items without studying them. `/browse` has a search box and the five JLPT Level lists; each Kanji, Word or Grammar Point has its own page at `/browse/items/<study item id>`. A page shows the item's level (a plain "N5", or "Unlevelled"), its details, its Examples with inline credit, and links to related items. An item the Learning Path has not reached shows a **Locked** badge, and an item not yet introduced shows a **Learn now** button that links to Learn. No position numbers appear anywhere. A Retired Word's page sends the Learner to its successor. Locked items can always be read here.

## Sub-features

- `browse-level-lists` shows N5 to N1 as pill buttons (N5 first) over the Kanji, Words and Grammar of the chosen level.
- `browse-search` replaces the list with matches by written form, reading or meaning while the box has text; clearing it brings the level list back. The level pills are hidden while searching.
- `browse-pages` opens a Kanji, Word or Grammar Point page from any row, and from the related links on a page.
- `browse-locked` shows the **Locked** badge on a page when `learning-path` says the item is locked for this Learner.
- `browse-learn-now` shows **Learn now**, a link to `/learn?now=<id>`, on every page whose item the Learner has not introduced.
- `browse-redirect` sends a Retired Word's page to its successor Word (`/browse/items/<retired id>` becomes `/browse/items/<successor id>`).
- `browse-level-labels` prints the level as plain `N5`..`N1` or `Unlevelled`, with no estimate marker.
- `browse-api` answers `GET /api/browse/levels/:level`, `/search?q=` and `/items/:id` for a logged-in Learner only: 401 without a session, 404 for an unknown level or Study Item.

## How to get to it (user POV)

- Log in, then click **Browse** in the nav (`http://localhost:5173/browse`).
- Pick a level, or type in **Search**, then click a row.

## Driving it with Playwright

Preconditions:

- Baseline, plus a verified Learner logged in (account slice) and the N5 fixture graph loaded: `DATABASE_URL=<verify db url> pnpm --filter @mojibun/content-graph seed:fixture`.
- For the redirect journey, a Retired Word with a superseded-by link: in `psql`, mark one fixture Word's `content_graph.study_item` row `retired = true` and insert a `content_graph.word_superseded_by` row from it to another approved Word. Say so in the evidence.

- **Level list.** Open `/browse`. `verify.sh shot /browse browse/level-list`. The N5 pill is pressed and the page lists 10 Kanji, 10 Words and 10 Grammar Points under their headings, each row showing an `N5` pill. Click **N1**: the page reads "Nothing at N1 yet. Pick another level above."
- **Search.** Type `moon` in **Search**. The level pills disappear and the list shows 月 (Kanji and Word). Type `zzzz`: 'Nothing matches "zzzz".' with the button **Clear the search**. Click it: the box empties and the N5 list returns.
- **Page, locked.** Click a row, then read the badge. `verify.sh shot /browse/items/<id> browse/page-locked`. Cross-check with `psql`/the API: `curl -s -b <cookie> http://localhost:5173/api/browse/items/<id>` has `"locked": true` exactly when the page shows **Locked**. In the fixture with a new Learner, one item per Track is not locked and the rest are.
- **Learn now.** On any page the Learner has not introduced, the **Learn now** link's `href` is `/learn?now=<that id>`. After placement marks the item Known (placement slice), reload: **Learn now** is gone and the badge is gone.
- **No position numbers.** Read the text and ARIA snapshot of a locked page: no rank, order or "#N" appears.
- **Redirect.** Open `/browse/items/<retired id>`. The address bar ends in the successor's id and the page shows the successor.
- **Logged out.** In a fresh context open `/browse`. The page reads "Log in to browse." and `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/api/browse/levels/N5` prints `401`.
- **Spec.** `pnpm exec playwright test --project=learner slices/browse/tests` passes.

## Gotchas

- Levels shown on a page are the current JLPT Level from core `content-graph/levels` (Editorial > List > Derived, else Unlevelled). To check a page's level against the store: `psql "$DATABASE_URL" -c "select level from content_graph.computed_level where record_id = '<study item id>'"`. Sentence, Reading Passage and Listening Clip levels sit in the same table, keyed by their own id.
- Listening Clips are not browsable: `/browse/items/<clip id>` is a 404.
- The Learn slice reads `?now=`; until it is merged **Learn now** lands on `/learn` without starting the item.
- Search returns at most 50 results, exact matches first.
