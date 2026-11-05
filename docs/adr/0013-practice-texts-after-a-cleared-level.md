# Learners generate their own practice once a level is cleared

Once a Learner has a **Cleared Level** (every levelled Kanji of it Known), they can generate Reading Passages and listening dialogues for that level whenever they like, up to 5 in any rolling 24 h ([listening.md](../listening.md#practice-texts)). This is a supervisor requirement. A Learner who has finished a level's Kanji has run out of new material at that level, but should keep reading and listening at it, and the shared pool of passages and clips is finite.

A Practice Text is practice only. It is not a Study Item, has no Mastery and never feeds the scheduler. It goes through normal Content Approval, exactly as a Batch Text does ([ADR 0008](0008-batch-texts-generated-per-learner.md)), so there is still one trust level for everything shown to Learners.

The Learner picks from fixed options (level, kind, type, length, topic). There is no free-text prompt. That keeps Learner input out of the LLM prompt, so there is no prompt injection, and every output can be checked against known rules.

## Considered Options

- **Gate on every Study Item of the level being Known.** That would be stricter, but it is unreachable in practice: hundreds of Words per level, some always Relearning. The Kanji are the level's backbone, and the supervisor chose them.
- **Gate on items being introduced, not Known.** Then a Learner could rush through Learn just to unlock generation, without having remembered anything.
- **A free-text topic or prompt.** It is more fun, but it puts Learner text into the prompt and makes the output unpredictable.
- **Make generated dialogues Listening Clip Study Items.** They would join the Learner's Reviews, but Study Items are shared content in the Learning Path, and these are private. They are stored as Reading Passages with `form: dialogue` instead.

## Consequences

- One more Learner-triggered LLM cost. It is bounded by a per-Learner limit and by the Learner-triggered budget pool from #39.
- `progress` gains Practice Text records and the pure `isLevelCleared()` function.
- Reading Passages gain a dialogue form and comprehension questions of their own, separate from Examples.
- A new core job contract, `practice.generate`, the fourth exception to "the slice that enqueues a job owns its handler".
