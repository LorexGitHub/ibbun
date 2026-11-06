# dashboard

The Today screen a Learner lands on at `/`. It greets them with how many Study Items are due (and how many are kanji, words and grammar points), shows the due count and the day streak as figures, and shows Mastery by JLPT Level under "Your way up to N1": one tile per level with the share of its Study Items the Learner knows. The data comes from `GET /api/dashboard/today`; the screen is the dashboard's widget in the shell's `home` slot.

## Sub-features

- `dashboard-hero` greets by time of day, says "N reviews are waiting" (or "Nothing is due"), lists the due items by type, and links "Start reviews" (`/reviews`) and "Learn new" (`/learn`).
- `dashboard-figures` shows the due count and the streak in days.
- `dashboard-mastery` shows N5 to N1 with the share Known: a level at 90% or more is done, the first below is now, the rest step away; a level with nothing Known past now reads "not started".
- `dashboard-api` answers `GET /api/dashboard/today` for the logged-in Learner only: 401 without a session.

## How to get to it (user POV)

- Log in, then open `http://localhost:5173/` or click **Today** in the nav.
- Logged out, the same screen reads "Log in to see your day."

## Driving it with Playwright

Preconditions:

- Baseline, plus a verified Learner logged in (account slice) and the N5 fixture graph loaded: `DATABASE_URL=<verify db url> pnpm --filter @mojibun/content-graph seed:fixture`.
- To see non-zero figures the Learner needs Reviews. Until the Learn and Reviews slices exist, add them in `psql` through `progress.reviews`, and say so in the evidence.

- **Empty day.** Open `/`. `verify.sh shot / dashboard/empty`. The heading reads "Nothing is due" with the time-of-day greeting, the figures read `0 due` and `0 days`, and "Your way up to N1" lists N5 first with "0% · 30 items" and N4 to N1 "not started".
- **With Reviews.** After recording passed `srs` Reviews for some N5 Study Items more than a few days ago, reload `/`. The heading names the count, the lead line splits it by type, and the N5 tile's percentage moves. Cross-check the count: `psql ... -c "select count(distinct study_item_id) from progress.reviews where learner_id = '<id>'"` is the number of items with a schedule; the due figure is those whose next review time has passed.
- **Streak.** With Reviews on today and the days before it, reload `/`. The streak figure equals the number of consecutive days with a Review. A day with only a `lookup` Review does not count.
- **Logged out.** In a fresh context open `/`. The page reads "Log in to see your day." and `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/api/dashboard/today` prints `401`.
- **Spec.** `pnpm exec playwright test --project=learner slices/dashboard/tests` passes.

## Gotchas

- The API builds its Learner session reader on the first request from `AUTH_SECRET` and `APP_URL`. If either is unset the request fails with a 500 and the screen reads "Your day didn't load", while the rest of the API keeps working.
- "New" and "Learn N new" are not shown: they need `learning-path`, which is not built.
- The streak counts UTC days.
- The `learner` Playwright project exists only once `slices/account/register.ts` does.
