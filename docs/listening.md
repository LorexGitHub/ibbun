# Listening

Decided in [#38](https://github.com/LorexGitHub/ibbun/issues/38). Terms follow [CONTEXT.md](../CONTEXT.md). This builds on [#5](https://github.com/LorexGitHub/ibbun/issues/5) (what a Listening Clip is), [#11](https://github.com/LorexGitHub/ibbun/issues/11) (VOICEVOX and voice credits), [#18](https://github.com/LorexGitHub/ibbun/issues/18) (dictation and comprehension grading) and [#15](https://github.com/LorexGitHub/ibbun/issues/15) (Listening Tracks). Why Learners can generate their own practice is in [ADR 0013](adr/0013-practice-texts-after-a-cleared-level.md).

## Sentence Audio and Listening Clips

Two things are kept apart:

- **Sentence Audio.** Every approved Sentence gets a cached VOICEVOX audio file. It plays after a Review is answered, in the Learn lesson and in Reading Passages. It is not a Study Item.
- **Listening Clip.** A Study Item, in the N*x* Listening Tracks. Only a selection of Sentences become one, so the Listening Tracks stay small enough to finish.

There are two kinds of Listening Clip.

| Kind | Made from | Made by | Example kind ([#18](https://github.com/LorexGitHub/ibbun/issues/18)) |
|---|---|---|---|
| `sentence` | one approved Sentence | derived, no LLM | dictation |
| `dialogue` | 2 speakers, an ordered run of Sentences | generated, Content Approval | comprehension, **2** per dialogue |

### Single-Sentence clips

One per levelled Word and Grammar Point. The Sentence is picked by a fixed rule from the item's approved Examples:

1. Only Sentences with **no unlevelled Words**.
2. The one closest to the level's length band (for example 10–25 characters at N5; bands are config).
3. Ties are broken by `hash(Study Item ID, Sentence ID)`.

If no Sentence qualifies, there is no clip. Nothing is generated just for listening. If the chosen Sentence's Example is Retired, the clip is Retired too, and the rule picks again.

### Dialogues

- **Trigger.** Every levelled Grammar Point gets an automatic Generation Request for **one** dialogue that uses it, plus Words at or below its level. That makes roughly as many dialogues per level as Grammar Points.
- **Speakers.** 2, labelled 男 and 女 as in JLPT scripts, not named. Dialogues stand alone: no cast or episodes (those belong to Batch Texts).
- **Length.** It grows with the level, from about **4** lines at N5 to about **12** at N1 (config per level).
- **Questions.** 2 comprehension Examples per dialogue, of two different JLPT 聴解 task types, rotated:
  - 課題理解: what will the person do next;
  - ポイント理解: why, or which detail;
  - 概要理解: the gist (N3 and above).

  Each holds a question in Japanese, one correct option and three distractors, written as Japanese text with no pictures. Reviews alternate between the two. Wrap-Up uses the other one, as #18 asks.
- **Not in v1.** 即時応答 and 発話表現 need other formats and get their own issue. So do dialogues with 3 speakers.
- **Approval.** The dialogue, its Sentences and both questions are reviewed and approved as one unit. The automatic checks are the Reading Passage ones ([content-approval.md](content-approval.md#automatic-checks)): every token links to a Word, the level is at or below the target's, 0 unlevelled Words (≤1 at N1), the target Grammar Point matches. The reviewer's rubric adds natural spoken register, a clear speaker turn on every line, and questions that can only be answered from the audio.

### Level and order

Unchanged from #12 and #15. A clip's level is computed from the Words and Grammar Points its Sentences link to. Listening Tracks have no sort key, only dependencies: a clip depends on its Words and Grammar Points, and any that haven't been introduced are pulled into the batch just before it.

## Voices

- An **allow-list of 4–6 calm, adult-sounding VOICEVOX voices**. The supervisor picks them by listening. No.7, ユーレイちゃん and voices that need approval when a company is involved are left out ([#11](https://github.com/LorexGitHub/ibbun/issues/11)).
- Sentence Audio and single-Sentence clips use the voice at `hash(Sentence ID) mod allow-list`, so Learners hear several voices over time.
- A dialogue gets two different voices, one male-sounding and one female-sounding, so the speakers are easy to tell apart. They are picked by hash too.
- Every voice on the allow-list is credited on the credits page as `VOICEVOX:<character>` (#19).

## Audio files

- Synthesised once, at speed **1.0**, as **Opus**.
- Stored in object storage (a local volume in dev). The key is `hash(kana/accent string, voice, engine version, speed)`, so synthesising again is idempotent, and a dialogue line reuses existing audio when the text and voice match.
- The `listening.synthesise` job runs in `content-generation`. Its contract lives in core `content-graph`, next to `content.generate`.
- Approval is unchanged ([content-approval.md](content-approval.md#listening-clips)): audio is approved automatically when the kana sent to VOICEVOX equals the approved reading, and the supervisor samples it by listening.

## Playback

- **Slow** plays at 0.75× with the browser's `playbackRate`, with pitch kept. There is no second file. It is a sticky Learner setting and never affects the grade.
- **Replays** are unlimited and carry no penalty. The count is logged on the Review, as hints are.
- **Text stays hidden until the Learner answers.** "Show answer" reveals it early and counts as a fail (#18). After answering, the transcript shows with the furigana setting from [#31](batch-text.md#furigana), the translation is behind a tap, and each line can be played on its own.

### Exam Mode

A Learner setting, **off** by default. When it is on:

- the clip plays **once**: there is no replay button and no slow speed;
- a comprehension question and its options are shown **before** the audio, as in JLPT 聴解 課題理解. Dictation shows only the input box;
- grading and scheduling are unchanged. The Review logs `examMode: true`.

It applies everywhere a Listening Clip is asked: the Learn quiz, Reviews, Wrap-Up, Ghosts, `listening` practice and Practice Text dialogues. The Learn **lesson** ignores it, because the lesson teaches and doesn't test.

## Learn

A Listening Clip's lesson goes in three steps:

1. **Listen.** The clip plays, and replay and slow speed are always available.
2. **Read.** The transcript with furigana, the translation, and links to the clip's Words and Grammar Points.
3. **Quiz.** The clip's Example (dictation or comprehension), on a fresh play.

## Dictation feedback

A failed dictation shows a **diff per token** against the Sentence's Sudachi tokens. Each token is marked correct, wrong or missing, with its surface form and its reading. Either form counts as correct, as in #18. Grading stays all or nothing; the diff is feedback only.

## Practice Texts

Once a Learner has a **Cleared Level**, they can generate their own reading or listening practice for it, as often as the limit allows. Why is in [ADR 0013](adr/0013-practice-texts-after-a-cleared-level.md).

### Cleared Level

A JLPT Level is cleared for a Learner when **every levelled Kanji of that level is Known** to them ([#13](https://github.com/LorexGitHub/ibbun/issues/13)). Suspended and Retired Kanji don't count. Words and Grammar Points are not required. Being introduced in Learn is not enough. Once cleared, a level stays cleared, as Known is permanent. Unlevelled has no cleared state.

`isLevelCleared(levelKanjiIds, knownIds)` is a pure function in core `progress`. The caller reads the level's Kanji from `content-graph`.

### What the Learner chooses

On a Generate screen:

- a cleared level;
- the kind: **Reading Passage** or **dialogue**;
- the JLPT passage type ([jlpt-reading-formats.md](research/jlpt-reading-formats.md)) or 聴解 task type, or "any";
- the length: short, medium or exam length;
- an optional topic from a fixed list (仕事, 旅行, 学校, …).

There is **no free-text prompt**, so nothing a Learner types reaches the LLM.

### Content rules

The same rules as Batch Texts ([batch-text.md](batch-text.md#automatic-checks)): every Word and Grammar Point is at or below the level, or Known; proper nouns and numbers don't count. The generator is given the Learner's **weakest Known items** of that level (lowest FSRS stability first) and must use at least half of them.

### What a Practice Text is

- **Practice only.** It is not a Study Item, gets no Mastery and never feeds the scheduler.
- **A passage** is a Reading Passage, shown like a Batch Text: tap-to-translate, lookups logged as `lookup`.
- **A dialogue** is a Reading Passage with `form: dialogue`: a speaker per line, Sentence Audio in the speakers' voices, and 2 comprehension questions stored on the passage. The questions are graded with `grade()` and logged as `cram`.
- **Approval.** Normal Content Approval, as for Batch Texts ([ADR 0008](adr/0008-batch-texts-generated-per-learner.md)): automatic checks, then the reviewer agent, then supervisor samples. 3 attempts.
- **Waiting.** The Learner waits up to **20 s**. After that the text appears in their library when ready.
- **Private.** The Practice Text record (Learner, level, kind, choices, passage ID) lives in `progress`. Other Learners never see it.

### Limits

- **Per Learner:** at most **5** Practice Texts in any rolling 24 h (config). This is counted separately from the Batch Text limit.
- **Budget:** Practice Texts draw on the Learner-triggered budget pool with Batch Texts ([accounts.md, #39](https://github.com/LorexGitHub/ibbun/issues/39)), never on the pool that Content Approval needs.
- When either limit is reached, the Learner sees "try again tomorrow". Nothing is queued silently.

## Wiring

| Where | Does |
|---|---|
| `reviews` | Scheduled Listening Clip Reviews, Wrap-Up and Ghosts, like every Study Item |
| `learn` | The three-step Listening Clip lesson |
| `listening` | Free practice: pick a level, hear clips and answer, logged as `cram`. The Learner's Practice Text dialogues. Generate screen for dialogues |
| `reading` | The Learner's Practice Text passages. Generate screen for passages |
| `content-generation` | Dialogue drafts, single-Sentence clip selection, `listening.synthesise` (TTS), and `practice.generate` |
| `content-approval` | Dialogue and Practice Text checks and rubrics |
| core `content-graph` | Job contracts `listening.synthesise` and `practice.generate`. Listening Clip `kind`, the speaker and voice on **voices**, Sentence Audio keys, `form: dialogue` and comprehension questions on Reading Passages (all additive) |
| core `progress` | Practice Text records, `isLevelCleared()`, the per-Learner Practice Text count |
| core `learner` | The Exam Mode and slow-speed settings |

`practice.generate` follows the [ADR 0008](adr/0008-batch-texts-generated-per-learner.md) exception: a Learner-facing slice enqueues it, and an admin slice handles it.

## What a Listening Review records

On top of [#18](https://github.com/LorexGitHub/ibbun/issues/18): `replays`, `slow` (whether slow speed was used) and `examMode`.
