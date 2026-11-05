# Owned IDs inside a Word; derived links are a rebuildable cache

ADR 0002 gave every Content Graph record a mojibun-owned ID. That is not enough for JMdict. Much of what we add hangs *inside* a Word: a Japanese Explanation per sense, pitch accent per reading, Sentence uses Word links that name a sense, overrides on a gloss. JMdict senses have no IDs, only a position, and senses get reordered, merged and split between monthly releases. So written forms, readings and senses each get a mojibun ID too. Forms and readings are matched across refreshes by their text. Senses are matched by a fingerprint (part of speech plus normalised glosses), falling back to closest similarity. When a sense has no confident match, everything hanging off it goes back to Draft for Content Approval instead of being silently re-pointed.

Derived links (Word contains Kanji, Sudachi-derived Sentence uses Word, Listening Clip voices Sentence, superseded by) are fully determined by a process version and its inputs, and no Review, Example or override points at them. They are a cache: rebuilds replace them outright. This is the one exception to "nothing is hard-deleted"; retirement stays for every record something can point at.

## Considered Options

- **Point at senses by position.** No matching code, but a reordered entry would silently attach a Japanese Explanation or a reading fix to the wrong meaning.
- **Treat any sense change as a new sense.** Safe, but every gloss typo fix upstream would throw away our explanations and send Examples back to Draft each month.
- **Retire derived links like other records.** Keeps one rule, but every SudachiDict upgrade would leave hundreds of thousands of retired rows that nothing reads.

## Consequences

- `applySnapshot()` in `content-graph/authoring` owns the matching. The fingerprint and similarity threshold are tuned there and covered by contract tests.
- A badly tuned matcher shows up as a flood of `unmatched sense` items; the circuit breaker in [import-pipeline.md](../import-pipeline.md) stops such a run before it applies.
