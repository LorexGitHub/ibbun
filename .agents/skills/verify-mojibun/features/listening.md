# listening

Free Listening practice (`slices/listening`, issues #66 and #198): the player is the screen. A Learner hears a clip and picks one of four options. Every graded answer is logged as a `cram` Review, so it never moves the schedule.

## Sub-features

- **Level**: N5 to N1 pills in `group "Level"`; the chosen one has `aria-pressed="true"`. The screen opens on N5 with a clip ready, nothing to pick first. A level with no playable clip says "No N1 clips yet. Pick another level, or read at your level instead." with the link **Open Reading** to `/reading`.
- **The player**: one large round button, `aria-label="Play"`, plays each line of the clip in order; bars beside it move while it plays (`.player[data-playing="true"]`). `group "Speed"` holds the pills "1×" and "0.75×" (the pressed one sets `playbackRate`; 0.75× starts pressed when the Learner's `slowAudio` preference is on). "Again" replays and is disabled until the clip has played once. There is no list of clips on the screen.
- **The question**: a prompt and four shuffled options under the player, shown after the first play. The server grades the option with `grade()`; an input that is none of the options answers `retry` and logs nothing. Nothing is typed on this screen: a clip whose Example holds no question is not served (404) and the screen skips it.
- **Show answer**: counts as a fail (`revealed: true`) and shows the transcript.
- **Transcript** (after the answer only): speaker, text, collapsible translation, per-line audio; "Correct" or "Not quite"; the right option after "Answer:". "Next clip" moves on and wraps at the end.
- **Exam Mode** (Learner preference `examMode`): the question is shown before the audio, "Play" works once ("Played once" afterwards), there is no Again and no speed. The Review logs `listening: {replays: 0, slow: false, examMode: true}`.
- **Logging**: `GET /api/listening/clips?level=`, `GET /api/listening/clips/:id`, `POST /api/listening/clips/:id/answer`. The answer is recorded with `kind: "cram"`, the clip as the Study Item, the Example asked, and `listening: {replays, slow, examMode}`.

## Practice dialogues (issue #95)

A second card on `/listening`, "Practice dialogues": a Learner at a Cleared Level generates their own dialogue and answers its 2 questions. Slice code is in `slices/listening/practice`.

- **Cleared Level**: every non-suspended Kanji of the level is Known. A Learner with none sees "Know every Kanji of a level to unlock dialogues at that level." and no form.
- **Generate form**: Level (Cleared only), Question type (Any, 課題理解, ポイント理解, plus 概要理解 from N3), Length (Short, Medium, Exam length), Topic (a fixed list). No free text. "N left today." shows the rolling 24 h allowance (`PRACTICE_TEXT_LIMIT`, default 5); at 0 it says "Try again tomorrow." and shows no form.
- **Waiting**: "Making your dialogue…" for up to 20 s, polling. If it is not approved and voiced by then: "It will appear in your library when it is ready."
- **Library** ("Your dialogues"): one row per dialogue, "Listen" once ready, "Being made…" before.
- **Playing**: the dialogue takes the screen (the free player above is hidden and not mounted, so there is one Play button and one set of keys). It is the same card as a clip (Play, question, answer, transcript), but answers go to `POST /api/listening/practice/:id/answer`. Each answer is a `cram` Review whose Study Item is the passage and whose `exampleId` is `<passageId>:<question>`. "Next question" rotates between the 2 questions.
- **API**: `GET /api/listening/practice/options`, `GET /api/listening/practice` (library), `POST /api/listening/practice` (202 `{id}`, 400 outside the choices, 403 not cleared, 429 at the limit), `GET /api/listening/practice/:id` (202 `{status:"pending"}` until ready), `POST .../:id/answer`. Another Learner's id is a 404.

Driving it: the Learner needs every Kanji of N5 Known (log `manual` Reviews for them), then `/listening`, fill the form, "Generate a dialogue". Generation needs the worker, the `practice.generate` handler and an LLM; without them the dialogue stays "Being made…", which the page handles. The spec checks only the locked-or-form state. Gotchas: the dialogue's text is never sent before the answer; the library does not refresh while the page sits open.

## How to get to it (user POV)

Sign in, then "Listening" in the nav (`/listening`). Press Play, pick an option.

## Driving it with Playwright

Preconditions:

- The Compose stack, API and web app are up (the `verify-mojibun` skill does this) and the browser has a Learner session (the `learner` project's stored state).
- The content graph holds approved Listening Clips with audio and a question at the level you choose. Without them the page shows "No N5 clips yet." and nothing else can be exercised; seed some with the `content-graph-fixture` feature first.

Steps:

1. `page.goto("/listening")`; expect the heading "Listening".
2. Expect `getByRole("button", {name: "N5"})` with `aria-pressed=true` and `getByRole("button", {name: "Play", exact: true})`, without a click.
3. Click Play, then click an option or press its key, 1 to 4.
4. Expect "Correct" or "Not quite", the transcript and "Next clip".
5. Evidence of the log: the Learner's reviews for the clip show a `cram` entry with the `listening` detail (read it from the progress API or the database).
6. Exam Mode: turn `examMode` on in the Learner's preferences first, reload, and expect no `group "Speed"`, no Again, and a disabled Play after one play.

The spec is `slices/listening/tests/listening.spec.ts` (either a clip or the empty state is accepted).
- **One level.** Open `/listening?level=n5`: the N5 clips start without a click, and the `group "Level"` buttons are gone because the "Level filter" in the header holds the levels. Without `?level=` the buttons are back.

## Gotchas

- Audio is requested as `/audio/<key>`. Whether that route serves files depends on the stack; a missing file ends the line silently and the page still works, so check the network tab if nothing is heard.
- Playwright cannot hear audio. Assert on the buttons, the `Audio` requests and the Review record, not on sound.
- The question only appears after the first Play (immediately in Exam Mode); asserting it before that fails by design.
- Which Example of a clip is asked rotates with the number of Reviews already logged for it, so the same clip can show a different question on a second visit.
- "Show answer" on a clip you were unsure of is logged as a fail, like a wrong answer.
- Not built: dictation by typing (dropped from this screen in #198), furigana in the transcript, remembering the speed.

## Keys

- The options are **1** to **4**. **Enter** is Next clip.
- A key never runs while the Learner types in a field (Enter excepted), while a dialog is open, or with Ctrl, Alt or ⌘ held. Each key shows as a small `kbd` mark on its button, hidden on touch screens, and the button carries `aria-keyshortcuts`.
