# Review answer model

Decided in [#18](https://github.com/LorexGitHub/mojibun/issues/18). Terms follow [CONTEXT.md](../CONTEXT.md). This document fixes what a Learner is asked, what they may type, and how the answer is graded into the single pass/fail that [ADR 0001](adr/0001-fsrs-6-and-anki-style-mastery.md) feeds to FSRS. Kanji are reviewed in context ([ADR 0005](adr/0005-kanji-reviewed-in-context.md)).

## Examples for every Study Item type

Every Review shows one Example, and each Review rotates to a different approved Example of the same Study Item. A Study Item with no approved Example is Suspended ([import-pipeline.md](import-pipeline.md#suspended-study-items)).

| Study Item | Example target | Learner does | Facets |
|---|---|---|---|
| Grammar Point | the span that shows the Grammar Point, blanked | types the missing Japanese | 1 |
| Word | the span where the Word is used (often inflected), blanked | types the missing Japanese | 1 |
| Kanji | a Word in the Sentence that contains the Kanji, **highlighted, not blanked** | types the Word's reading in this Sentence (kana), and the Kanji's English meaning | 2 |
| Listening Clip | the whole Sentence or dialogue, as audio | **dictation**: types what they hear; or **comprehension**: picks one of four options | 1 |

- A Kanji Example tests the Kanji's reading where it is actually used, so no on'yomi/kun'yomi labelling is needed. Example generation is queued for **levelled Kanji only** (about 2.1k of the 13k imported).
- A Listening Clip Example is one of two kinds. A clip of a single Sentence defaults to `dictation`, and a dialogue defaults to `comprehension`. A comprehension Example holds a question in Japanese with one correct option and three distractors. The options are shuffled every time. The question's English translation is shown when the English toggle is on.

## Answer data

Answer data hangs off the Example.

| Field | Holds | When the input matches it |
|---|---|---|
| **Accepted answers** | a written form plus its kana reading, each with an ID | pass |
| **Alternates** | answers that are correct Japanese but not the target, each with a nudge message ("that works, but we're looking for the casual form") | the nudge is shown, nothing is graded, and the Learner tries again |
| **Known wrong answers** | common mistakes, each with an explanation | fail, and the explanation is shown |
| **Hint** | an optional English gloss of just the target | opened on demand |

Kanji meaning answers come from the Kanji's KANJIDIC2 meanings, with overrides applied. The known-wrong list for meanings sits on the Kanji, not on the Example.

### Where it comes from

- **Accepted answers are derived** from the target span: its surface form, plus its kana reading from the Sentence's Sudachi tokens. The reading is stored when the Example is written, so grading never calls NLP. When the Sentence text changes and the span moves ([import-pipeline.md](import-pipeline.md)), the derived answers are rebuilt with it.
- Alternates, known wrong answers, the hint and comprehension questions are **generated** with the Example and go through Content Approval (#16). Examples built from Tatoeba Sentences get them generated too.
- Accepted answers added after a Learner's flag (see [Flags](#my-answer-was-right-flags)) are authored overrides, so a refresh keeps them.

### Approval rule

A Learner may turn off either the English translation or the Japanese Explanation, but not both (see [Toggles](#toggles)). An Example is approved only if the text left on can never be missing:

| Example of | Needs |
|---|---|
| Word, Grammar Point | the Sentence's English translation **and** the target's Japanese Explanation |
| Kanji | the Sentence's English translation **and** the Japanese Explanation of the target **Word sense** |
| Listening Clip | the English translation only (there is no Japanese Explanation) |

## Input

- **Japanese answers are typed with the system IME** (kana, or kanji where the Learner knows it). IME text goes in untouched.
- **Romaji is converted to kana as it is typed** (wanakana bind mode, which leaves IME text alone). The Learner always sees the kana that will be graded. The preference *Convert romaji as I type* is **on** by default. When it is off, Latin letters are refused with "switch to Japanese input".
- The English meaning facet of a Kanji Review is never converted.

## Matching

Input and answers are normalised first: NFKC, trimmed, and the final 。！？ removed.

- **Japanese cloze and Kanji reading:** an **exact** match against an accepted answer's written form or its kana reading. There is no fuzzy matching, because in Japanese a one-character difference (て/で, を/が) is usually a real mistake. Hiragana and katakana count as the same only when the accepted form is in katakana. Mixed kanji and kana input passes only if it matches a stored form.
- **Kanji meaning (English):** lower-cased, with punctuation removed and a leading "to " or article dropped. It passes on an exact match to any meaning, or a string similarity of at least **0.8**, unless it is on the Kanji's known-wrong list.
- **Dictation:** all punctuation and spaces are also ignored. It passes if it equals the Sentence, where each token may be typed as its surface form or as its kana reading (from the stored Sudachi tokens). It is all or nothing.
- **Comprehension:** choosing the correct option passes. Any other option fails.

A Review passes only if **every** facet passes (#13).

## No Undo

The first graded submission is final. A Learner can retry with no penalty only when:

- the input is **not an answer**: it is empty, or it has leftover Latin letters; or
- the input matches an **alternate**, which shows its nudge.

These tries are recorded in `attempts[]` but never graded. Bunpro's Undo, which lets Learners take back a wrong answer before moving on, is deliberately left out: the Review log is the source of truth for FSRS and has to stay honest.

## Hints and reveal

- Opening the hint, the translation or the Japanese Explanation **never** affects the grade.
- **Show answer** counts as a fail.

## Toggles

Two Learner preferences, stored in `learner`:

- **English translation:** on by default.
- **Japanese Explanation:** off by default.

At least one is always on. The settings screen won't let a Learner turn off the last one. The prompt shows whatever is on. The info panel after answering shows both, whatever the toggles say.

## The grader

- One pure function, `grade(answerData, input) → { outcome, matchedAnswerId?, message? }`, per facet. It is exported from core `content-graph`, as an additive export ([architecture.md](architecture.md)).
- The web client runs it for instant feedback. The API runs it again before `progress.record()`, so a forged pass is never stored.
- Learn, Reviews, Wrap-Up, Ghosts, Cram and Listening practice all use it. There is no second grader.
  - **Learn quiz:** a miss is asked again until it is right. That is what "fully correct" means.
  - **Wrap-Up:** a missed Study Item is asked again with a **different** Example where one exists, so the Learner can't just repeat the answer they were shown.
  - **Ghost:** the exact Example that was missed.

## What a Review records

On top of the fields ADR 0001 already gives a Review (Learner, Study Item, `kind`, time):

- `exampleId`;
- per facet: the raw input, the normalised input, the outcome, and the matched answer ID (accepted, alternate or known-wrong);
- `attempts[]`: the tries before the graded one that weren't graded;
- which hints were opened, and whether the answer was revealed;
- time to answer.

Hints and time to answer are stored for later analysis. They don't change the schedule.

## "My answer was right" flags

A Learner can flag a graded facet (`reviewId` plus facet). The flag goes into the Content Approval queue with the input attached. If it is approved, the input becomes an accepted answer for future Reviews. **The past Review is not regraded in v1.** A regrade could be added later as an appended correction event, because the log is append-only, but it would add a new Review `kind`.

## Out of scope here

- The text to read after each Learn batch: [#31](https://github.com/LorexGitHub/mojibun/issues/31).
- How alternates, known wrong answers and comprehension questions are generated and checked: #16.
