# Learning Path

Decided in [#15](https://github.com/LorexGitHub/mojibun/issues/15), with the level and order rules set in [#12](https://github.com/LorexGitHub/mojibun/issues/12). Terms follow [CONTEXT.md](../CONTEXT.md). Why the path is code with a per-Learner seed and no stored order is in [ADR 0009](adr/0009-learning-path-as-versioned-strategy.md).

The Learning Path decides which New Study Items Learn offers next, and which are locked. The Content Graph holds no order ([content-graph.md](content-graph.md)), so every rule here is computed from fact links, frequency data and the Learner's own history.

## Tracks

A **Track** is one Study Item type at one JLPT Level: N4 Kanji, N4 Words, N4 Grammar, N4 Listening, and the same four for each level and for Unlevelled. That makes 24 Tracks.

- **Strict order within a Track.** Learn offers an item only once every item before it in the Track has been introduced. Items only need to be introduced, not mastered.
- **Free choice between levels.** No level gates another. A Learner can study N1 Grammar before N5 Grammar.
- **Unlevelled** Tracks are never offered unless the Learner makes one active.

### Introduced

An item counts as introduced once it has passed Learn, been made Known by Placement, or been skipped in Learn with "I know this". These are all read from `progress`.

### Items that never block

- **Suspended** items (no approved Example) and **Retired** items are skipped. A Suspended item that later gets an approved Example is offered next, because it sits earlier in the order.
- An item whose JLPT Level changes moves to the Track of its new level. If it was already introduced, nothing happens.

## Active Tracks

The Learner marks any set of Tracks active, on a type × level grid. For example: N3 and N2 Grammar, N4 Kanji and N4 Words. Progress in a Track is kept when it is made inactive and active again.

A Learn batch takes items from the active Tracks in rounds:

- Each round goes through the active Tracks in order, easiest level first, and each Track contributes its next unlocked item.
- A Track with no unlocked items left drops out of the rotation.
- Pulled-in dependencies (below) come on top of the batch size.

Batch size and the single daily budget for New items belong to the `learn` slice and the Learner's preferences, not to the Learning Path.

## Order within a Track

Items are sorted by a key that depends on their type, then by a per-Learner random tie-break.

| Type | Sort key, first to last |
|---|---|
| Word | JMdict `nf` band (`nf01`–`nf48`, 500 Words each), then other JMdict priority tags (`news`, `ichi`, `spec`, `gai`), then the rest |
| Kanji | KANJIDIC2 `freq` in bands of 250, then KANJIDIC2 grade, then the rest |
| Grammar Point | How many other Grammar Points of the same level its approved Examples demonstrate, fewest first |
| Listening Clip | None; dependencies only |

The tie-break is `hash(learner seed, Study Item ID)`. Two Learners starting the same Track see different first items from the same band. Adding a new item never reshuffles the others. Band sizes are config values.

The Grammar Point key comes from fact links (Sentence demonstrates Grammar Point), so the graph stays free of order. Grammar Points whose Examples need little other grammar come first.

Unlevelled Tracks use the same keys. About 200k JMdict Words have no priority tag at all; they come last, in random order.

## Dependencies

Dependencies come from fact links, and only between items of the **same level**:

- A **Word** depends on the Kanji in its first approved written form. Rare spellings don't count.
- A **Listening Clip** depends on the Words and Grammar Points its Sentences link to.
- **Grammar Points** have no dependencies. The sort key above orders them.

An N5 Word whose Kanji is N3 does not wait for N3. Furigana covers the gap, as in [jlpt-levels.md](jlpt-levels.md#independence-from-kanji). Dependencies only run from one type to another (Kanji → Word → Listening Clip, Grammar Point → Listening Clip), so they can never form a cycle.

### Pulled in, never blocking

When Learn offers an item whose dependencies are not yet introduced, it **pulls them into the same batch**, just before the item. Their own Tracks don't need to be active. When their Track later reaches them, they are skipped, because they are already introduced. No Track ever waits for another.

## Learn now

A Learner can start any item early on purpose: a locked one, one from an inactive Track, or an Unlevelled one. The Learning Path guides; it never stops a Learner from learning what they want.

- Browse shows a **Locked** badge and a **Learn now** button. It shows no position number, because each Learner's order is different.
- Learn now runs the normal Learn flow (lesson, then the quiz that must be fully correct) and pulls in the item's dependencies.
- It does not use up the daily budget. The budget only limits what Learn offers on its own.
- The item counts as introduced. When its Track reaches it, it is skipped.

Locked items can always be read in Browse and practised in Cram.

## Batch Texts

A batch can now mix levels. For its [Batch Text](batch-text.md), a batch's level is the hardest level among its items, with Unlevelled counting as the hardest. A Learn now batch has a Batch Text like any other.

## Storage and swapping

- The Learning Path is **code**: a named, versioned strategy in core `learning-path`. There is no rule language.
- **No order is stored.** Each Learner has one random seed in the `learning_path` schema, set at sign-up, and their active Tracks. The order is recomputed from the Content Graph and the seed. Introduced items are read from `progress`.
- **Swapping** means deploying a new strategy version and pointing one config value at it. Already-introduced items don't change; only the order of what is left does. There is no migration and no per-Learner choice of strategy.

### Interface

`learning-path` exposes:

- `next(learner, n)`: the next `n` items for a Learn batch, drawn from the active Tracks as above, plus their pulled-in dependencies.
- `forItem(learner, item)`: the item plus its pulled-in dependencies, for Learn now.
- `isLocked(learner, item)`: for the Browse badge.
- reads and writes of the Learner's active Tracks.

It reads `content-graph` (approved, non-retired items, levels, links, frequency data) and `progress` (introduced items), as the [core dependency rules](architecture.md#core-modules) allow.
