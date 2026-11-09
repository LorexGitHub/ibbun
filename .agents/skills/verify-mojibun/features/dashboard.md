# dashboard

The Today screen a Learner lands on at `/`. In the Ma look (ADR 0014) it shows the greeting and streak in small caps, the due count as one large Mincho number, one line about it, the next step, a "Where to?" search and Mastery by JLPT Level under "Your way up to N1" as a stepper from N5 to N1. The data comes from `GET /api/dashboard/today`; the screen is the dashboard's widget in the shell's `home` slot.

## Sub-features

- `dashboard-hero` reads "Good evening · 42 days in a row" (no streak part at 0), then the due count (the `h1`, read as "18 reviews due"), "reviews wait for you." or "Nothing waits for you today.", and the breakdown by type. The accent button is "Start reviews" (`/reviews`) while anything is due and "Learn something new" (`/learn`) once nothing is; the other is the outline button.
- `dashboard-go-to`: the "Where to?" button opens the shell's ⌘K menu.
- `dashboard-figures`: the due count animates with NumberFlow.
- `dashboard-mastery` shows N5 to N1 as a stepper with the share Known, the line filled up to where the Learner is: a level at 90% or more is done, the first below is now, the rest step away; a level with nothing Known past now reads "not started".
- `dashboard-api` answers `GET /api/dashboard/today` for the logged-in Learner only: 401 without a session.

## How to get to it (user POV)

- Log in, then open `http://localhost:5173/` or click 今 (Today) in the dock.
- Logged out, `/` shows the shell's welcome instead (see `shell.md`); the widget's "Log in to see your day." is only reached if the session check and the dashboard API disagree.

## Driving it with Playwright

Preconditions:

- Baseline, plus a verified Learner logged in (account slice) and the N5 fixture graph loaded: `DATABASE_URL=<verify db url> pnpm --filter @mojibun/content-graph seed:fixture`.
- To see non-zero figures the Learner needs Reviews. Until the Learn and Reviews slices exist, add them in `psql` through `progress.reviews`, and say so in the evidence.

- **Empty day.** Open `/`. `verify.sh shot / dashboard/empty`. The number reads 0 under the time-of-day greeting, the line reads "Nothing waits for you today.", "Learn something new" is the accent button, and "Your way up to N1" lists N5 first with "0% · 30 items" and N4 to N1 "not started".
- **With Reviews.** After recording passed `srs` Reviews for some N5 Study Items more than a few days ago, reload `/`. The large number is the count, the line under it splits it by type, and N5's percentage on the stepper moves. Cross-check the count: `psql ... -c "select count(distinct study_item_id) from progress.reviews where learner_id = '<id>'"` is the number of items with a schedule; the due figure is those whose next review time has passed.
- **Streak.** With Reviews on today and the days before it, reload `/`. The small caps line reads "N days in a row" for the number of consecutive days with a Review. A day with only a `lookup` Review does not count.
- **Logged out.** In a fresh context open `/`. The page shows the shell's welcome, and `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/api/dashboard/today` prints `401`.
- **Spec.** `pnpm exec playwright test --project=learner slices/dashboard/tests` passes.

## Gotchas

- "New" and "Learn N new" are not shown: they need `learning-path`, which is not built.
- The streak counts UTC days.
- The `learner` Playwright project exists only once `slices/account/register.ts` does.
