# browse

Where a logged-in Learner reads about Study Items without studying them. `/browse` is the Library: a Mastery wall that shows one JLPT Level and one Track at a time, every Study Item a tile shaded by the Learner's Mastery of it. A tile opens the item as a sheet over the wall; each Kanji, Word or Grammar Point also has its own page at `/browse/items/<study item id>`. Sheet and page show the same thing: the item's level (a plain "N5", or "Unlevelled"), its details, its Examples with inline credit, and links to related items. An item the Learning Path has not reached shows a **Locked** badge, and an item not yet introduced shows a **Learn now** button that links to Learn. No position numbers appear anywhere. A Retired Word's page sends the Learner to its successor. Locked items can always be read here.

## Sub-features

- `browse-wall` shows two tab rows, **JLPT Level** (N5 to N1) and **Track** (Kanji, Words, Grammar), over the list `<level> <Track>` of tiles (`.wall`). The level starts at the one in the address (`/browse?level=n3`), else N5, and follows the header's level filter. A tile carries `data-mastery` (`new`, `learning`, `relearning`, `young`, `mature`) and is named "written form, meaning, Mastery". A line above counts the wall ("10 Kanji at N5. 2 Learning, 1 Mature.") and a legend below names the five shades.
- `browse-search` dims the tiles on the wall that do not match what is typed, by written form, reading or meaning. It asks the server nothing and never leaves the wall. The count line adds "n match."
- `browse-sheet` opens the pressed tile's Study Item as the dialog "Study Item" on the right. **Close**, Esc or a click beside it puts it away. The sheet lies above the dock. It shows the headword large, the level and type as pills, then the details, each group of related items and the Examples as parts under their own rule and small-caps heading.
- `browse-pages` opens a Kanji, Word or Grammar Point page from the related links in a sheet or on a page.
- `browse-cram-this` shows **Cram this**, a link to `/cram?items=<id>`, on every sheet and page.
- `browse-locked` shows the **Locked** badge on a page when `learning-path` says the item is locked for this Learner.
- `browse-learn-now` shows **Learn now**, a link to `/learn?now=<id>`, on every page whose item the Learner has not introduced.
- `browse-redirect` sends a Retired Word's page to its successor Word (`/browse/items/<retired id>` becomes `/browse/items/<successor id>`).
- `browse-level-labels` prints the level as plain `N5`..`N1` or `Unlevelled`, with no estimate marker.
- `browse-api` answers `GET /api/browse/levels/:level`, `/search?q=` and `/items/:id` for a logged-in Learner only: 401 without a session, 404 for an unknown level or Study Item. Each item of a level list carries the Learner's `mastery`, `new` for anything not yet taught. The screen no longer calls `/search`.

## How to get to it (user POV)

- Log in, then click **Library** in the nav (`http://localhost:5173/browse`).
- Pick a level and a Track, or type in **Search**, then press a tile.

## Driving it with Playwright

Preconditions:

- Baseline, plus a verified Learner logged in (account slice) and the N5 fixture graph loaded: `DATABASE_URL=<verify db url> pnpm --filter @ibbun/content-graph seed:fixture`.
- For the redirect journey, a Retired Word with a superseded-by link: in `psql`, mark one fixture Word's `content_graph.study_item` row `retired = true` and insert a `content_graph.word_superseded_by` row from it to another approved Word. Say so in the evidence.

- **Wall.** Open `/browse`. `verify.sh shot /browse browse/wall`. The heading reads "Library", the tabs N5 and Kanji are selected, and the list "N5 Kanji" holds 10 tiles under "10 Kanji at N5. None started yet." for a new Learner. **Words** and **Grammar** show 10 tiles each. Click **N1**: the page reads "No Kanji at N1 yet. Pick another level or Track above."
- **Mastery.** After placement marks an item Known, or a Batch is learned, reload: that tile's `data-mastery` is no longer `new`, it is shaded, and the count line names it. Cross-check with `curl -s -b <cookie> http://localhost:5173/api/browse/levels/N5`.
- **Search.** Type `moon` in **Search**. Every tile but 月 goes dim (`data-dim`) and the line ends "1 match." Type `zzzz`: 'Nothing on this wall matches "zzzz".' with the button **Clear the search**, and every tile is dim. Click it: the box empties and the wall is lit again.
- **Sheet.** Press a tile. The dialog "Study Item" slides over the right of the wall with focus on **Close**. `verify.sh shot` it as `browse/sheet`. Esc closes it; so does a click on the dimmed wall. **Cram this** goes to `/cram?items=<id>` and starts a Cram of that one item.
- **Page, locked.** Open a tile's sheet, or its page, then read the badge. `verify.sh shot /browse/items/<id> browse/page-locked`. Cross-check with `psql`/the API: `curl -s -b <cookie> http://localhost:5173/api/browse/items/<id>` has `"locked": true` exactly when the page shows **Locked**. In the fixture with a new Learner, one item per Track is not locked and the rest are.
- **Learn now.** On any page the Learner has not introduced, the **Learn now** link's `href` is `/learn?now=<that id>`. After placement marks the item Known (placement slice), reload: **Learn now** is gone and the badge is gone.
- **No position numbers.** Read the text and ARIA snapshot of a locked page: no rank, order or "#N" appears.
- **Redirect.** Open `/browse/items/<retired id>`. The address bar ends in the successor's id and the page shows the successor.
- **Logged out.** In a fresh context open `/browse`. The page reads "Log in to open the Library." and `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/api/browse/levels/N5` prints `401`.
- **Spec.** `pnpm exec playwright test --project=learner slices/browse/tests` passes.

## Gotchas

- Levels shown on a page are the current JLPT Level from core `content-graph/levels` (Editorial > List > Derived, else Unlevelled). To check a page's level against the store: `psql "$DATABASE_URL" -c "select level from content_graph.computed_level where record_id = '<study item id>'"`. Sentence, Reading Passage and Listening Clip levels sit in the same table, keyed by their own id.
- Listening Clips are not browsable: `/browse/items/<clip id>` is a 404.
- The Learn slice reads `?now=`; until it is merged **Learn now** lands on `/learn` without starting the item.
- `/api/browse/search` returns at most 50 results, exact matches first. Within a tier, items on a JLPT Level come first (easiest first), then the shorter label: `q=water` starts with 水. A romaji query is also searched as hiragana: `q=taberu` finds 食べる. The wall's own search is not capped: it only dims.
- A level list holds every Study Item of the level. With the real import that is thousands of Words at N1; the wall draws them all as tiles.
