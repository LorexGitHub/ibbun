# Batch Texts

Decided in [#31](https://github.com/LorexGitHub/ibbun/issues/31). Terms follow [CONTEXT.md](../CONTEXT.md). Why each Learner gets their own generated text is in [ADR 0008](adr/0008-batch-texts-generated-per-learner.md). The JLPT passage formats are summarised in [research/jlpt-reading-formats.md](research/jlpt-reading-formats.md).

After each Learn batch, the Learner reads a short text that uses every Study Item in that batch, so they meet new Kanji, Words and Grammar Points in context and not in isolation. The aim is for Learners to read as much as possible and enjoy it.

Batches are unique to each Learner, because order is shuffled per Learner ([learning-path.md](learning-path.md)). A batch can mix levels; its level here is the hardest level among its items, with Unlevelled counting as the hardest. So the text is generated for each Learner when they pick the batch.

## Approval

A Batch Text is approved the normal [#4](https://github.com/LorexGitHub/ibbun/issues/4) way ([content-approval.md](content-approval.md)), with no lighter tier. It arrives `draft`, must pass the automatic checks below, and then the reviewer agent must pass it. The supervisor spot-checks a sample. It reaches the Learner only once approved.

## Storage

| What | Where | Notes |
|---|---|---|
| The passage, its Sentences (with English translations) and their links | `content-graph`, as a Reading Passage | Shared content, never deleted. Its Sentences can become Examples elsewhere, but only through their own approval |
| The **Batch Text** record: Learner, JLPT Level (or Unlevelled), episode number, the batch's Study Item IDs, the passage ID, the running episode summary, the cast | `progress` | Learner data, so it stays out of the Content Graph. Additive change; `progress` → `content-graph` IDs is already allowed |

A Batch Text is not offered to other Learners.

## Flow

1. `learn` picks a batch. If the Learner already has **5** Batch Texts in the last 24 h (config, [accounts.md](accounts.md#llm-quotas)), the batch has no Batch Text and nothing is enqueued. Otherwise `learn` enqueues `batch-text.generate` with the Learner ID, level and batch item IDs. The job name and its Zod payload schema live in core `content-graph` (see [Wiring](#wiring)).
2. `content-generation` handles the job. It picks the earlier items, target length and passage type, calls `llm`, and writes a `draft` Reading Passage through `content-graph/authoring` and the Batch Text record through `progress`.
3. `content-approval` runs the automatic checks and then the reviewer agent.
4. If a check fails, generation is retried with the failures fed back to the LLM, **3 attempts** in total (config). After the third failure, the batch has no Batch Text. The failure is logged to the Content Approval queue so the supervisor can see the failure rate.
5. When the quiz ends, `learn` waits up to **20 s** (config) for an approved text. If it isn't ready, the screen says the text is still being prepared, and the Learner can read it later from `reading`.

No text is stitched together from the batch's Examples: the Learner has just seen those Sentences.

## Wiring

`learn` is Learner-facing and can't import `llm`, so it can't own the handler. This is the one exception to "the slice that enqueues a job owns its handler" ([architecture.md](architecture.md#dependency-rules)): a job contract may live in core, so one slice enqueues and another handles.

| Slice | Does |
|---|---|
| `learn` | Enqueues the job, shows the newest Batch Text at the end of Learn |
| `content-generation` | Handles the job: generation and retries |
| `content-approval` | Automatic checks, reviewer agent, failure log |
| `reading` | Lists the Learner's past Batch Texts per level as episodes, for rereading |

## Automatic checks

Over Sudachi tokens:

- **Every batch item appears.**
  - Word: a token has the Word's lemma.
  - Grammar Point: its [Matcher Rule](grammar-points.md) matches.
  - Kanji: the character appears inside an allowed Word (a batch Word, or one that passes the cap below).
- **Everything else is within reach.** Every other Word and Grammar Point is Known to the Learner, or has a JLPT Level at or below the batch's level. For an Unlevelled batch, anything Known or levelled (N5–N1) is allowed. Proper nouns and numbers don't count.
- **Earlier items:** at least half of the earlier items given to the generator appear.
- **Length:** within the target range.

A batch item the Learner skipped in Learn ("I know this", a `manual` Known) is not required. It is treated like any other Known item.

The reviewer agent also checks naturalness, translations, the passage type, and consistency with the episode summary.

## Style

The generator uses the JLPT reading section's own passage types for the batch's level and rotates through them, so batches don't feel the same:

| Level | Passage types |
|---|---|
| N5, N4 | memo, notice, email, diary, short explanation |
| N3 | adds explanation and short essay (随筆) |
| N2, N1 | adds commentary and argument (評論, 主張) |
| Unlevelled | the N2/N1 list |

Prose only in v1. Tables (情報検索) and two-text comparisons (統合理解) don't fit a Reading Passage made of ordered Sentences, and need their own issue.

### A continuing story

Each Learner gets a small recurring cast and setting for each level, generated with their first Batch Text at that level. Each later text is the next **episode**: the passage type still rotates, so one episode may be an email from a character and the next their diary. The generator gets the running episode summary, and each new episode updates it.

## Length

Length grows as the Learner works through a level.

- **Progress** in a level is the share of its Study Items this Learner has met in Learn, from 0 to 1.
- The **target length** moves in a straight line from the level's shortest exam passage length (短文) at 0 to its longest at 1 (長文, or 中文 at N5 and N4, which have no 長文).
- **Unlevelled** uses the number of Unlevelled items met, in fixed bands (for example every 200 items), up to the N1 長文 length.
- All lengths and bands are config, one row per level, starting from the figures in [research/jlpt-reading-formats.md](research/jlpt-reading-formats.md).

### Earlier items

Besides the batch, the text brings back **earlier items**: Study Items of the same level the Learner met in earlier batches. Their number grows with length, so later texts reuse more of what came before.

- About one earlier item per 50 characters of target length (config).
- The weakest come first: Relearning, then Learning, then Young with the lowest stability, then the rest.

## Reading screen

- Shown at the end of Learn, after the quiz. It is **skippable** and never blocks Reviews: the batch already went into Reviews when the quiz passed.
- No graded question in v1. A Japanese multiple-choice question in the #18 Listening format can come later.
- Batch items and earlier items are highlighted, in two different styles.
- Each Sentence's English translation is hidden until tapped.
- Tapping a Word opens a lookup, logged as Review kind `lookup` ([ADR 0001](adr/0001-fsrs-6-and-anki-style-mastery.md)). Nothing in a Batch Text feeds the scheduler or shows a grade.

## Furigana

An app-wide Learner setting, stored in `learner`, used for all Japanese text: Batch Texts, Reading Passages, and Example Sentences in Learn and Reviews.

| Value | Furigana on |
|---|---|
| On | every Word containing kanji |
| Off | nothing |
| **Mixed** (default) | only Words that are still **New** to the Learner (never met in Learn). In a Review, the target Word gets none |

The Mixed rule needs the Learner's Mastery, so it is one shared function in core, next to the Mastery reads in `progress`.
