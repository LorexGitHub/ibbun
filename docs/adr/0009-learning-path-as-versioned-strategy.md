# The Learning Path is a versioned strategy over a per-Learner seed, with no stored order

#3 promised that sequencing could change without touching the Content Graph or Reviews. #12 then set the rules: strict order within a level, free choice between levels, and a different order for each Learner that still respects dependencies. A stored per-Learner order would go stale every time content is approved, retired or re-levelled, and changing the rules would need a migration for every Learner. So the Learning Path is code: one named, versioned strategy in core `learning-path`. Each Learner stores only a random seed and their active Tracks. The order is recomputed from the Content Graph, with `hash(seed, Study Item ID)` breaking ties so that a new item never reshuffles the others. Introduced items are read from `progress`. Swapping the path means deploying a new version and changing one config value ([learning-path.md](../learning-path.md)).

## Considered Options

- **A rule language stored as data** (an editable rules table or DSL). More moving parts than one strategy needs, and still needs code for anything new, such as a new sort key.
- **Materialise each Learner's order** when they start a level. Fast to read, but it needs patching whenever an item is approved, retired or changes level, plus a migration for every rule change.
- **One mixed queue per level.** It would hold a grammar-focused Learner behind hundreds of Kanji. One Track per type per level, with dependencies pulled into the batch, keeps every Track moving.
- **Block on unmet dependencies** instead of pulling them in. Tracks would stall on each other.
- **Strict locks with no way around them.** The supervisor chose Learner curiosity: any item can be started with Learn now.

## Consequences

- The Content Graph stays free of order; dependencies come only from fact links (Word contains Kanji, Listening Clip voices Sentence, Sentence uses Word and demonstrates Grammar Point).
- To keep `next()` fast, `learning-path` may cache sort keys and dependency edges per Track. The cache is rebuildable, like the derived links in [ADR 0004](0004-owned-sub-entry-ids-and-derived-links-as-cache.md).
- A strategy change reorders only what a Learner has not met yet.
- Batches can mix levels, so a Batch Text takes the hardest level in its batch.
