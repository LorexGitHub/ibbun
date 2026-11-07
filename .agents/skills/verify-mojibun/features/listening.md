# listening

Free Listening practice (`slices/listening`, issue #66): a Learner picks a level, hears its clips and answers. Every graded answer is logged as a `cram` Review, so it never moves the schedule.

## Sub-features

- **Level picker**: N5 to N1 buttons; the chosen one has `aria-pressed="true"`. A level with no playable clip says "No N1 clips yet."
- **Clip playback**: "Play" plays each line of the clip in order, then the button reads "Replay". A "Slow (0.75×)" checkbox sets `playbackRate` to 0.75; it starts ticked when the Learner's `slowAudio` preference is on.
- **Dictation** (type what you heard, `aria-label="What did you hear?"`, kana IME) and **comprehension** (a question with four shuffled choice buttons, asked after the first play). The server grades both with `grade()`; empty or unusable input answers `retry` and clears the box without logging.
- **Show answer**: counts as a fail (`revealed: true`) and shows the transcript.
- **Transcript** (after the answer only): speaker, text, collapsible translation, per-line audio; "Correct" or "Not quite"; the right option for a comprehension question. "Next clip" moves on and wraps at the end.
- **Exam Mode** (Learner preference `examMode`): the question is shown before the audio, "Play" works once ("Played once" afterwards), there is no Replay and no slow checkbox. The Review logs `listening: {replays: 0, slow: false, examMode: true}`.
- **Logging**: `GET /api/listening/clips?level=`, `GET /api/listening/clips/:id`, `POST /api/listening/clips/:id/answer`. The answer is recorded with `kind: "cram"`, the clip as the Study Item, the Example asked, and `listening: {replays, slow, examMode}`.

## How to get to it (user POV)

Sign in, then "Listening" in the nav (`/listening`). Choose a level, press Play, answer.

## Driving it with Playwright

Preconditions:

- The Compose stack, API and web app are up (the `verify-mojibun` skill does this) and the browser has a Learner session (the `learner` project's stored state).
- The content graph holds approved Listening Clips with audio at the level you choose. Without them the page shows "No N5 clips yet." and nothing else can be exercised; seed some with the `content-graph-fixture` feature first.

Steps:

1. `page.goto("/listening")`; expect the heading "Listening practice".
2. `getByRole("button", {name: "N5"}).click()`; expect `aria-pressed=true`, then `getByRole("button", {name: "Play", exact: true})`.
3. Click Play, then answer: `getByLabel("What did you hear?").fill("...")` + `Check`, or click a choice button.
4. Expect "Correct" or "Not quite", the transcript and "Next clip".
5. Evidence of the log: the Learner's reviews for the clip show a `cram` entry with the `listening` detail (read it from the progress API or the database).
6. Exam Mode: turn `examMode` on in the Learner's preferences first, reload, and expect no checkbox and a disabled Play after one play.

The spec is `slices/listening/tests/listening.spec.ts` (either a clip or the empty state is accepted).

## Gotchas

- Audio is requested as `/audio/<key>`. Whether that route serves files depends on the stack; a missing file ends the line silently and the page still works, so check the network tab if nothing is heard.
- Playwright cannot hear audio. Assert on the buttons, the `Audio` requests and the Review record, not on sound.
- The question of a comprehension clip only appears after the first Play (immediately in Exam Mode); asserting it before that fails by design.
- Which Example of a clip is asked rotates with the number of Reviews already logged for it, so the same clip can show a different question on a second visit.
- "Show answer" on a clip you were unsure of is logged as a fail, like a wrong answer.
- Not built: per-token feedback on a wrong dictation, furigana in the transcript, remembering the Slow toggle.
