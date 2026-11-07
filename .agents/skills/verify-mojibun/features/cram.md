# cram

Cram lets a Learner choose Study Items, including ones still Locked, and practise them one Example at a time. Answers are graded by `grade()` and logged as `cram` Reviews, so Mastery, the schedule and statistics stay exactly as they were. Screen: `/cram`. API: `/api/cram`.

## Sub-features

- `cram-choose` lists a level's Kanji, Words and Grammar Points (all of them, Locked or not), narrowed by type or a search, and keeps the choice across searches.
- `cram-practise` asks each chosen item once, blanking the target (highlighting it for a Kanji), with a hint on request, retries for empty input, Latin letters and alternates, and Show answer as a fail.
- `cram-log` stores each graded answer as a `cram` Review with its facets, attempts, hints and time, and nothing else.
- `cram-untouched` leaves Mastery, Known, Introduced and due dates unchanged.
- `cram-unavailable` answers 503 for `/api/cram` alone when `DATABASE_URL`, `SMTP_URL`, `AUTH_SECRET` or `APP_URL` is missing; the rest of the API still works.

## How to get to it (user POV)

- Log in, then click **Cram** in the nav, or open `http://localhost:5173/cram`.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports every line `ok`.
- The N5 fixture is loaded (`DATABASE_URL=<verify db url> pnpm --filter @mojibun/content-graph seed:fixture`).
- The API process has `AUTH_SECRET` (32+ bytes), `APP_URL=http://localhost:5173` and `SMTP_URL=smtp://localhost:1025` set.
- A verified Learner is logged in (account slice) with no Reviews.

- **Choose.** Open `/cram`. `verify.sh shot /cram cram/choose`. The aria snapshot lists a `Study Items` list with checkboxes and a disabled `Practise 0 items` button. Click `Choose all shown`; the button reads `Practise 30 items` or the count of the filtered list.
- **Locked items.** Pick a Word the Learner never learned. It is listed and practisable.
- **Practise.** Click `Practise N items`. `1 of N` appears with a sentence containing `＿＿＿`. Type the answer in the textbox, click `Check`; `Right.` or `Not quite.` shows. Click `Next`; `2 of N` appears.
- **Retry.** Type `q` and click `Check`: a message appears and nothing is saved.
- **Show answer.** Click `Show answer`: `Not quite.` and `Answer: …`.
- **Finish.** After the last item, `x of N right. Mastery and statistics are unchanged.` shows.
- **Stored value.** `docker compose -p mojibun-verify exec postgres psql -U mojibun -c "select kind, passed from progress.review order by at"` lists only `cram` rows for the answers given (check the table name with `\dt progress.*`).
- **Mastery untouched.** The Learner's dashboard (or `psql` count of rows whose kind is `srs`, `manual` or `learn`) shows no change.
- **Unconfigured.** Without `AUTH_SECRET`, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/cram/items?level=N5` prints `503` and `/api/health` still answers `{"ok":true}`.
- **Slice spec.** `env -u CI pnpm exec playwright test --project=learner slices/cram/tests` passes.

## Gotchas

- Cram needs the account slice's login; until `slices/account` exists the `learner` project does not run and `/api/cram` answers 401 or 503.
- A Study Item with no approved Example (or a Listening Clip) is skipped and named at the end.
- Kanji ask two facets (reading in the Sentence, English meaning); both must pass.
