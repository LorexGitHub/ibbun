# JLPT Levels

Decided in [#22](https://github.com/LorexGitHub/mojibun/issues/22). Terms follow [CONTEXT.md](../CONTEXT.md). Where levels sit in the graph is in [content-graph.md](content-graph.md#jlpt-level); why they are stored as candidates is in [ADR 0007](adr/0007-jlpt-level-candidates.md).

Every JLPT Level is an estimate. The JLPT has published no official lists since 2010, and nearly every list in circulation goes back to Jonathan Waller's Tanos lists ([research #8](https://github.com/LorexGitHub/mojibun/issues/8), [licence #21](https://github.com/LorexGitHub/mojibun/issues/21)).

## Level Candidates

A Study Item can hold several **Level Candidates**, each a level (N5–N1) with its own Provenance and approval state. Its current JLPT Level is computed from its Approved candidates by precedence:

1. **Editorial**: a level set by a person or reviewer through Content Approval. It wins until it is retired.
2. **List**: a level from a published list (Tanos, and hanabira for Grammar Points).
3. **Derived**: a level from a deterministic rule (below). It only fills gaps.

No Approved candidate means **Unlevelled**. Candidates that lose are kept but never shown to Learners. A refresh of a List source rewrites only that source's candidates, so it can never overwrite an Editorial fix.

The current level is a computed view, not a field anyone writes.

## Sources

| Study Item | List source | Join key | Arrives |
|---|---|---|---|
| Word | Tanos vocab lists, as mapped to JMdict by [yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab) (stephenmk, CC BY-SA 4.0) | JMdict `ent_seq` | Approved |
| Kanji | Tanos kanji lists (CC BY) | the Kanji literal | Approved |
| Grammar Point | hanabira and Tanos grammar lists, by the rule in [grammar-points.md](grammar-points.md#jlpt-level) (#20) | seeded once | as #20 says |

- **Words.** yomitan-jlpt-vocab has already done the hard join from Tanos rows to JMdict entries and fixed spellings. Its ShareAlike adds nothing, because every Word we show is already BY-SA through JMdict. It is a dataset with its own Import Runs and `source_key` rows. It is checked weekly and applied only on a new release, like KanjiVG. Provenance credits Waller and stephenmk.
- **Kanji.** tanos.co.uk no longer resolves and the lists have not changed since 2010–2011, so the kanji lists are imported once from the archived copy, with Provenance pointing at the snapshot.
- **KANJIDIC2's `jlpt` field** (pre-2010 levels 1–4) never sets a level. Old level 2 cannot be split into N3 and N2 without another source. It is used only as a cross-check: where it disagrees with the Tanos level (old 4 ≠ N5, old 3 ≠ N4, old 1 ≠ N1, old 2 ∉ {N3, N2}), the Kanji goes into the Content Approval queue with reason `level disagreement`. A reviewer resolves it by adding an Editorial candidate or by dismissing it.

### Collisions and misses in the Tanos lists

- If one Word or Kanji is listed at two levels, the **easiest** level wins, so the Learner meets it as early as any list suggests. The Import Run report lists every collision.
- Tanos rows with no JMdict match, or with several, are listed in the report and skipped. Anyone who wants one of them levelled adds an Editorial candidate.

## Derived levels

Only one rule in v1:

- **A jōyō Kanji (KANJIDIC2 grade 1–8) with no List candidate gets N1.**

Words are not promoted by rule. 22.6k JMdict Words are marked common and Tanos lists about 8k; putting the rest in N1 would make N1 meaningless, and rules such as "the hardest level among its Kanji" give confident wrong answers (人気 would be N5). Unlisted Words are promoted one at a time as Editorial candidates. Bulk LLM proposals through Content Approval are possible later if Learners hit gaps.

## The derived-level process

One process in core `content-graph` computes, as a rebuildable cache ([ADR 0004](adr/0004-owned-sub-entry-ids-and-derived-links-as-cache.md)):

- the Derived candidates, with Provenance "derived by process X, version Y";
- the current-level view;
- the **computed levels** of Sentences, Reading Passages and Listening Clips.

It rebuilds incrementally when its inputs change (a candidate, a link, a KANJIDIC2 grade) and in full when the process version changes.

### Computed levels

A Sentence's level is the highest current level among the Words and Grammar Points it links to. **Unlevelled Words are ignored**, so one proper noun or rare Word doesn't drop a Sentence out of its level. Each Sentence also stores its **unlevelled Word count**. Example selection prefers Sentences where it is zero, but nothing is excluded on it. Tap-to-lookup covers the Word nobody tagged.

Reading Passages work the same way. A Listening Clip takes the level of its Sentences.

## Independence from Kanji

A Word's level does not depend on its Kanji's levels. An N5 Word may contain an N3 Kanji; furigana covers the gap. The Learning Path makes a Word wait for its Kanji only when both are at the same level ([learning-path.md](learning-path.md#dependencies)).

## When a level changes

- The Learner sees no notice. A Learner who has finished N4 may find one more N4 item in Learn, and their per-level counts shift.
- Mastery is untouched: it belongs to the Study Item, not to the level.
- A new circuit breaker in [import-pipeline.md](import-pipeline.md#circuit-breaker): a run that would change the current level of more than **100** Study Items stops before apply. The number is a config value.
- When a merged JMdict entry has a successor, its current level is copied to the successor as a **Draft Editorial** candidate.

## What Learners see

A plain level, such as "N3", with no marker on each item. The note that levels are estimates, and the credit to Waller (with a link) and stephenmk, go on the credits page. Where exactly is #19's call.

## Where the code lives

- Level candidates, precedence, the Derived rule and the computed levels are domain rules in core `content-graph` (writes in `content-graph/authoring`).
- The `import` slice parses yomitan-jlpt-vocab and the Tanos kanji lists, like every other dataset.
- `content-approval` holds the `level disagreement` queue and Editorial candidates.
