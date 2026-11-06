# reviews

The `reviews` slice (`slices/reviews`): the review session. It lists the Study Items due in `progress`, asks each through one approved Example, re-grades the answer in the API and appends a Review of `kind` `srs`. Listening Clips are not asked here yet.

## Sub-features

- `reviews-due` lists due Words, Grammar Points and Kanji at `/reviews`, one at a time. `GET /api/reviews/due` returns them with the Learner's `convertRomaji` and `explanations` preferences. A Study Item with no approved Example (Suspended) is left out.
- `reviews-rotate` shows a different approved Example on each Review of a Study Item (the one after the last in the log, wrapping).
- `reviews-cloze` blanks the target span of a Word or Grammar Point; the Learner types the missing Japanese.
- `reviews-kanji` highlights the Word in the Sentence and asks two facets, the reading in this Sentence (kana) and the Kanji's English meaning. Both must pass.
- `reviews-input` keeps IME text as typed and converts romaji to kana as it is typed when *Convert romaji* is on. When it is off, Latin letters are refused with "switch to Japanese input". The English meaning is never converted.
- `reviews-no-undo` treats the first graded submission as final: the field locks and only Next is left. An empty try, a try with leftover Latin letters, and a try that matches an alternate (its nudge shows) are not graded; they are kept in `attempts[]` and the field clears.
- `reviews-reveal` makes Hint, Translation and Japanese Explanation open on demand without touching the grade; **Show answer** records a fail.
- `reviews-record` appends the Review with `exampleId`, per-facet `rawInput`, `normalisedInput`, `outcome` and `matchedAnswerId`, `attempts[]`, `hintsOpened`, `revealed` and `timeToAnswerMs`. `POST /api/reviews/answer` grades again; a try that is not an answer gets 422 and stores nothing.

## How to get to it (user POV)

- Log in, pick **Reviews** in the nav, or open `http://localhost:5173/reviews`.
- A Study Item is due after Learn (or Placement, "I know this") and once its interval has passed.

## Driving it with Playwright

Preconditions:

- `verify.sh doctor` reports every line `ok`; the N5 fixture is loaded (`content-graph-fixture.md`) and a Learner is logged in.
- At least one fixture Study Item has a passed Review in `progress.reviews` older than its interval. Insert one: `psql "$DATABASE_URL" -c "insert into progress.reviews …"` (copy the columns from a row the app wrote), or pass Learn once the learn slice exists.

- **Cloze.** Open `/reviews`. `shot /reviews reviews/cloze` shows the Sentence with `＿＿＿`, the English translation, and a **Check** button.
- **Romaji.** Type `mizu` into the answer; the field shows `みず`. With the preference off, the field keeps `mizu` and **Check** shows "switch to Japanese input".
- **Not an answer.** Press **Check** with an empty field: the alert reads "type an answer first" and `progress.reviews` gains no row.
- **Answer.** Type the right answer and press **Check**: the status reads "Correct", the field is locked, and `select kind, passed, detail->>'exampleId' from progress.reviews order by seq desc limit 1` shows `srs | t | <example id>`.
- **Show answer.** On the next Review press **Show answer**: the accepted answer appears and the new row has `passed = f` and `detail->>'revealed' = 'true'`.
- **Kanji.** A Kanji Review highlights the Word (`<mark>`) and shows two fields. Fill only the reading and press **Check**: nothing is submitted.
- **Spec.** `pnpm exec playwright test --project=learner slices/reviews` passes once the `learner` project exists.

## Gotchas

- The `learner` Playwright project exists only once `slices/account/register.ts` does.
- The slice builds its own session resolver from `DATABASE_URL`, `AUTH_SECRET` and `APP_URL`; without them the API fails to start.
- Listening Clips are skipped, so a Learner whose only due items are clips sees "No Reviews are due".
