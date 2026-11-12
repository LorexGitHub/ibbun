# reviews

The `reviews` slice (`slices/reviews`): the review session. It lists the Study Items due in `progress`, asks each through one approved Example, re-grades the answer in the API and appends a Review of `kind` `srs`. After the session's Reviews it asks the due Listening Clips (`slices/reviews/listening`, issue #109), then runs Wrap-Up on every miss, then Ghosts.

## Sub-features

- `reviews-due` lists due Words, Grammar Points and Kanji at `/reviews`, one at a time. `GET /api/reviews/due` returns them with the Learner's `convertRomaji` and `explanations` preferences. A Study Item with no approved Example (Suspended) is left out.
- `reviews-rotate` shows a different approved Example on each Review of a Study Item (the one after the last in the log, wrapping).
- `reviews-cloze` blanks the target span of a Word or Grammar Point; the Learner types the missing Japanese.
- `reviews-kanji` highlights the Word in the Sentence and asks two facets, the reading in this Sentence (kana) and the Kanji's English meaning. Both must pass.
- `reviews-input` keeps IME text as typed and converts romaji to kana as it is typed when *Convert romaji* is on. When it is off, Latin letters are refused with "switch to Japanese input". The English meaning is never converted.
- `reviews-no-undo` treats the first graded submission as final: the field locks and only Next is left. An empty try, a try with leftover Latin letters, and a try that matches an alternate (its nudge shows) are not graded; they are kept in `attempts[]` and the field clears.
- `reviews-reveal` makes Hint, Translation and Japanese Explanation open on demand without touching the grade; **Show answer** records a fail.
- `reviews-record` appends the Review with `exampleId`, per-facet `rawInput`, `normalisedInput`, `outcome` and `matchedAnswerId`, `attempts[]`, `hintsOpened`, `revealed` and `timeToAnswerMs`. `POST /api/reviews/answer` grades again; a try that is not an answer gets 422 and stores nothing.
- `reviews-listening` asks the due Listening Clips after the other Reviews, under a "Listening" heading with its own "n of m" counter. `GET /api/reviews/listening/due` returns them as audio plus the question, never the text; `POST /api/reviews/listening/answer` grades again and logs an `srs` Review with `listening: {replays, slow, examMode}`.
  - **Playback.** "Play" plays the lines in order and then reads "Replay"; replays are unlimited and counted. "Slow (0.75×)" plays at `playbackRate` 0.75 (ticked when the `slowAudio` preference is on). The text stays hidden until the Learner answers; **Show answer** records a fail.
  - **Questions.** A Sentence clip asks dictation (`What did you hear?`); a dialogue asks comprehension (four shuffled choices, shown after the first play). Each Review rotates to the next Example, so a dialogue alternates between its two questions.
  - **Exam Mode.** With the `examMode` preference on, a comprehension question and its choices show before the audio, "Play" works once ("Played once" afterwards), and there is no Replay and no slow checkbox. The Review logs `listening: {replays: 0, slow: false, examMode: true}`.
  - **Dictation diff.** A failed dictation lists every Sudachi token as correct, wrong (with what was typed) or missing, with its surface form and reading, and any extra text after the last token (`aria-label="Dictation diff"`, each row has `data-status`). Grading stays all or nothing.
  - **Transcript.** After the answer: speaker, text, collapsible translation, per-line audio, "Correct" or "Not quite" and the right option for a comprehension question. "Next" moves on.
- `reviews-wrap-up` asks every Study Item missed in the session again, through a different approved Example where one exists, until it is answered right. Only the first (`srs`) answer counts toward Mastery; each re-ask is stored as `kind` `wrap-up`. `GET /api/reviews/wrap-up/:studyItemId?asked=<exampleId>` returns the re-ask prompt. A second `srs` answer for a Study Item that is no longer due gets 409.
- `reviews-ghosts` re-tests the exact Example missed in an `srs` Review between one hour and two days ago, once per miss, after the Wrap-Up (or alone when nothing is due). `GET /api/reviews/ghosts` lists them; each answer is stored as `kind` `ghost` and never changes the schedule or Mastery.
- `reviews-flags` (`slices/reviews/flags`) adds **My answer was right** under a wrong, typed Cloze or Kanji-reading answer (not under a right answer, a Show answer, or a Kanji meaning). `POST /api/reviews/flag` with `{studyItemId, exampleId, facet}` finds the Learner's latest `srs`, `wrap-up` or `ghost` Review of that Example and reads the typed input from the log (never from the request). It queues an `answer flag` entry in Content Approval: `record_id` = the Example, `detail` = `{reviewId, facet, input}`. Flagging the same Review facet again queues nothing new. The Review is not regraded: the log gains no row.

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
- **Answer.** Type the right answer and press **Check**: the gap turns into the answer in the success colour (`strong.answer--right`), the status reads "Correct", the field is locked, the translation shows under the sentence even with the English toggle off, an **Explanation** button opens the Japanese Explanation and then goes, and `select kind, passed, detail->>'exampleId' from progress.reviews order by seq desc limit 1` shows `srs | t | <example id>`.
- **Show answer.** On the next Review press **Show answer**: the gap turns into the answer in the error colour (`strong.answer--miss`) and the new row has `passed = f` and `detail->>'revealed' = 'true'`.
- **Kanji.** A Kanji Review highlights the Word (`<mark>`) and shows two fields. Fill only the reading and press **Check**: nothing is submitted.
- **Listening.** With a due clip, after the other Reviews: `getByRole("button", {name: "Play", exact: true})`, click it, answer (`What did you hear?` + **Check**, or a choice button). A wrong dictation shows the `Dictation diff` list. `select kind, detail->'listening' from progress.reviews order by seq desc limit 1` shows `srs | {"replays":…,"slow":…,"examMode":…}`.
- **Wrap-Up.** Due Review: type a wrong answer and press **Check**, then **Next**. A **Wrap-Up** heading appears with a different Example. Answer it wrong, **Next**: it comes back with the Example after that. Answer right, **Next**: "Session complete." with the count and the doors (see **Ending**). The log shows `srs | f`, `wrap-up | f`, `wrap-up | t` for the Study Item, and the two `wrap-up` rows leave the schedule alone (`GET /api/reviews/due` still reflects only the `srs` miss).
- **Ghosts.** Backdate a miss: `update progress.reviews set at = at - interval '2 hours' where kind = 'srs' and not passed` (use the table's real time column), then open `/reviews` with nothing else due. A **Ghosts** heading shows the missed Example exactly; answering it writes a row with `kind = 'ghost'`, and reloading `/reviews` no longer shows it.
- **Flag.** Give a wrong answer, press **My answer was right**: the status reads "Thanks, we will check your answer. This Review stays as graded.", `select reason, record_id, detail from content_graph.queue_entry where reason = 'answer flag' and not resolved` shows the Example and `{reviewId, facet, input}` with the wrong input, `progress.reviews` has no new row, and that Review's `passed` is still `f`. Posting the same flag again with `curl` leaves one entry. Supervisor view: the entry is listed at `/admin/content-approval` under `answer flag`.
- **Ending, after a session.** After the last step the heading reads "Session complete.", one line gives the count ("2 done, 1 right", scheduled Reviews only), and the `Where next` navigation holds three doors. With a failed Review in the session they are **Cram the Lapses** (`/cram?items=<the failed Study Item ids>`), **Learn** and **Reading**. With none they are **Learn**, **Reading** and **Listening**. Clicking the Cram door starts practice on exactly those items.
- **Ending, nothing due.** With nothing due and no Ghosts or clips, the heading reads "No Reviews are due.", one line reads "Clear until 16:40" (the next due time in local time, with the day when it is not today, absent when nothing is scheduled), and the doors are **Learn**, **Reading** and **Listening**. `GET /api/reviews/due` carries the same moment as `nextDue`. The words "Come back later" appear nowhere.
- **Spec.** `pnpm exec playwright test --project=learner slices/reviews` passes once the `learner` project exists.
- **One level.** With Reviews due at N5, open `/reviews?level=n4`: the screen says no Reviews are due (`GET /api/reviews/due?level=N4` and `/api/reviews/listening/due?level=N4` are empty). Click **N5** in the "Level filter": the session starts again with the N5 Reviews. Ghosts are not filtered.

## Gotchas

- A Ghost appears only one hour or more after the miss, so a Review missed seconds ago raises Wrap-Up but no Ghost until backdated.
- A Study Item with a single approved Example is re-asked through that same Example in Wrap-Up.
- Listening Clips are asked after the cloze and Kanji Reviews and before Wrap-Up; a missed clip is not re-asked in Wrap-Up. A clip needs approved audio (`/audio/<key>`) and a dictation or comprehension Example, or it is left out.
- Playwright cannot hear audio: assert on buttons, the `Audio` requests and the Review row (`kind = 'srs'`, `detail->'listening'`).
- The `learner` Playwright project exists only once `slices/account/register.ts` does.
- Listening Clips are skipped, so a Learner whose only due items are clips sees "No Reviews are due." at the end.
- A Kanji Review blanks nothing, so its accepted answers are listed in the status after a miss. A cloze shows the answer only in the gap.
