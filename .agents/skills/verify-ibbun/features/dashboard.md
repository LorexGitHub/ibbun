# dashboard

The Today screen a Learner lands on at `/`. In the Ma look (ADR 0014) it shows the greeting and streak in small caps, the due count as one large Mincho number, one line about it, the next step, a "Where to?" search and Mastery by JLPT Level under "Your way up to N1" as a stepper from N5 to N1. The data comes from `GET /api/dashboard/today`; the screen is the dashboard's widget in the shell's `home` slot. Every JLPT Level also has its own page at `/level/n5` to `/level/n1`, which the levels on Today and in the top line open.

## Sub-features

- `dashboard-hero` reads "Good evening · 42 days in a row" (no streak part at 0), then the due count (the `h1`, read as "18 reviews due"), "reviews wait for you." or "Nothing waits for you today.", and the breakdown by type. The accent button is "Start Reviews" (`/reviews`) while anything is due and "Learn 5 new" (`/learn`) once nothing is; the other is the outline button. The 5 is the Learner's own batch size from Settings.
- `dashboard-go-to`: the "Where to?" button opens the shell's ⌘K menu.
- `dashboard-figures`: the due count animates with NumberFlow.
- `dashboard-mastery` shows N5 to N1 as a stepper with the share Known, the line filled up to where the Learner is: a level at 90% or more is done, the first below is now, the rest step away; a level with nothing Known past now reads "not started". Each level is a link to its page.
- `dashboard-level` is the page at `/level/n4`: "JLPT Level" in small caps, the level's name as the `h1`, a list named "Progress" with Kanji, Words and Grammar ("62 of 170 Known · 36%" and a line filled that far), and a navigation named "Doors at N4" with Reviews ("7 due" or "nothing due"), Learn ("585 not yet Known" or "all Known"), Reading, Listening ("14 clips", "1 clip" or "no clips yet") and Placement. Each door's address carries the level, for example `/reviews?level=n4`. An address like `/level/n9` reads "There is no level N9. The levels run from N5 to N1." with "Back to Today".
- `dashboard-api` answers `GET /api/dashboard/today` and `GET /api/dashboard/levels/:level` (`n5` or `N5`) for the logged-in Learner only: 401 without a session, 404 for a level that does not exist.

## How to get to it (user POV)

- Log in, then open `http://localhost:5173/` or click 今 (Today) in the dock.
- For a level, click it under "Your way up to N1" or in the top line, or open `http://localhost:5173/level/n5`.
- Logged out, `/` shows the shell's welcome instead (see `shell.md`); the widget's "Log in to see your day." is only reached if the session check and the dashboard API disagree.

## Driving it with Playwright

Preconditions:

- Baseline, plus a verified Learner logged in (account slice) and the N5 fixture graph loaded: `DATABASE_URL=<verify db url> pnpm --filter @ibbun/content-graph seed:fixture`.
- To see non-zero figures the Learner needs Reviews. Until the Learn and Reviews slices exist, add them in `psql` through `progress.reviews`, and say so in the evidence.

- **Empty day.** Open `/`. `verify.sh shot / dashboard/empty`. The number reads 0 under the time-of-day greeting, the line reads "Nothing waits for you today.", "Learn 5 new" is the accent button, and "Your way up to N1" lists N5 first with "0% · 30 items" and N4 to N1 "not started".
- **With Reviews.** After recording passed `srs` Reviews for some N5 Study Items more than a few days ago, reload `/`. The large number is the count, the line under it splits it by type, and N5's percentage on the stepper moves. Cross-check the count: `psql ... -c "select count(distinct study_item_id) from progress.reviews where learner_id = '<id>'"` is the number of items with a schedule; the due figure is those whose next review time has passed.
- **Streak.** With Reviews on today and the days before it, reload `/`. The small caps line reads "N days in a row" for the number of consecutive days with a Review. A day with only a `lookup` Review does not count.
- **A level.** On `/` click N5 under "Your way up to N1". The address is `/level/n5`, the `h1` reads N5, and with the fixture and no Reviews the Progress list reads "0 of N Known · 0%" three times. The Reviews door reads "nothing due" and its `href` is `/reviews?level=n5`. Cross-check the counts with `curl -s -b <cookie> http://localhost:5173/api/dashboard/levels/n5`.
- **No such level.** Open `/level/n9`: the alert names N9 and "Back to Today" leads to `/`.
- **Logged out.** In a fresh context open `/`. The page shows the shell's welcome, and `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/api/dashboard/today` prints `401`.
- **Spec.** `pnpm exec playwright test --project=learner slices/dashboard/tests` passes.

## Gotchas

- The doors carry `?level=` but the screens behind them do not filter by it yet (#193). The counts on the doors are for the level all the same.
- The Reading door has no count: the dashboard cannot see how many texts a level has.
- The streak counts UTC days.
- The `learner` Playwright project exists only once `slices/account/register.ts` does.
