# reviews

The `reviews` slice (`slices/reviews`): the review session. It lists the Study Items due in `progress`, asks each through one approved Example, re-grades the answer in the API and appends a Review of `kind` `srs`. After the session's Reviews it runs Wrap-Up on every miss, then Ghosts. Listening Clips are not asked here yet.

## Sub-features

- `reviews-due` lists due Words, Grammar Points and Kanji at `/reviews`, one at a time. `GET /api/reviews/due` returns them with the Learner's `convertRomaji` and `explanations` preferences. A Study Item with no approved Example (Suspended) is left out.
- `reviews-rotate` shows a different approved Example on each Review of a Study Item (the one after the last in the log, wrapping).
- `reviews-cloze` blanks the target span of a Word or Grammar Point; the Learner types the missing Japanese.
- `reviews-kanji` highlights the Word in the Sentence and asks two facets, the reading in this Sentence (kana) and the Kanji's English meaning. Both must pass.
- `reviews-input` keeps IME text as typed and converts romaji to kana as it is typed when *Convert romaji* is on. When it is off, Latin letters are refused with "switch to Japanese input". The English meaning is never converted.
- `reviews-no-undo` treats the first graded submission as final: the field locks and only Next is left. An empty try, a try with leftover Latin letters, and a try that matches an alternate (its nudge shows) are not graded; they are kept in `attempts[]` and the field clears.
- `reviews-reveal` makes Hint, Translation and Japanese Explanation open on demand without touching the grade; **Show answer** records a fail.
- `reviews-record` appends the Review with `exampleId`, per-facet `rawInput`, `normalisedInput`, `outcome` and `matchedAnswerId`, `attempts[]`, `hintsOpened`, `revealed` and `timeToAnswerMs`. `POST /api/reviews/answer` grades again; a try that is not an answer gets 422 and stores nothing.
- `reviews-wrap-up` asks every Study Item missed in the session again, through a different approved Example where one exists, until it is answered right. Only the first (`srs`) answer counts toward Mastery; each re-ask is stored as `kind` `wrap-up`. `GET /api/reviews/wrap-up/:studyItemId?asked=<exampleId>` returns the re-ask prompt. A second `srs` answer for a Study Item that is no longer due gets 409.
- `reviews-ghosts` re-tests the exact Example missed in an `srs` Review between one hour and two days ago, once per miss, after the Wrap-Up (or alone when nothing is due). `GET /api/reviews/ghosts` lists them; each answer is stored as `kind` `ghost` and never changes the schedule or Mastery.

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
- **Wrap-Up.** Due Review: type a wrong answer and press **Check**, then **Next**. A **Wrap-Up** heading appears with a different Example. Answer it wrong, **Next**: it comes back with the Example after that. Answer right, **Next**: "Session complete." The log shows `srs | f`, `wrap-up | f`, `wrap-up | t` for the Study Item, and the two `wrap-up` rows leave the schedule alone (`GET /api/reviews/due` still reflects only the `srs` miss).
- **Ghosts.** Backdate a miss: `update progress.reviews set at = at - interval '2 hours' where kind = 'srs' and not passed` (use the table's real time column), then open `/reviews` with nothing else due. A **Ghosts** heading shows the missed Example exactly; answering it writes a row with `kind = 'ghost'`, and reloading `/reviews` no longer shows it.
- **Spec.** `pnpm exec playwright test --project=learner slices/reviews` passes once the `learner` project exists.

## Gotchas

- A Ghost appears only one hour or more after the miss, so a Review missed seconds ago raises Wrap-Up but no Ghost until backdated.
- A Study Item with a single approved Example is re-asked through that same Example in Wrap-Up.
- The `learner` Playwright project exists only once `slices/account/register.ts` does.
- Listening Clips are skipped, so a Learner whose only due items are clips sees "No Reviews are due".
