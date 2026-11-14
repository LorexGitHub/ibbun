# FSRS-6 scheduling with Anki-style Mastery, not Bunpro's fixed ladder

ibbun copies a lot of Bunpro's behaviour, but not its 12-level SRS ladder. Every Review is a pass or fail, and the outcomes are stored in an append-only Review log. That log is the source of truth. FSRS-6 (ts-fsrs 5.4.2, behind one `Scheduler` adapter) folds the log into each Learner × Study Item's schedule, using default weights, desired retention 0.9, `learningSteps` and `relearningSteps` of `['4h']`, and a 365-day maximum interval. Mastery uses Anki's states, read from FSRS stability: New, Learning, Young (stability < 21 days), Mature (stability ≥ 21 days) and Relearning. There is no Mastered or retired state. We chose FSRS because on the srs-benchmark it predicts recall far better than ladder-style schedules, and because binary grading loses almost nothing (see `docs/research/srs-scheduling.md`). We chose Anki's states because the supervisor finds them clearer than ladder tiers.

## Considered options

- **Bunpro/WaniKani fixed ladder.** Simple, and each stage has a name, but it does not model memory. It stays the fallback: because the log is the source of truth, switching schedulers means replaying the log, not migrating data.
- **FSRS-7 on ts-fsrs 6.0.0.** It benchmarks slightly better, but it was released 8 days before this decision, needs Node ≥24, and its stability is not the 90%-recall interval, which would break the 21-day Young/Mature line.
- **A "Mastered" top tier that retires items.** Rejected. FSRS has no natural end state, and occasional checks keep Mature honest.

## Consequences

- Learners get no scheduling settings in v1: no strictness and no interval multiplier.
- Only `srs` and `manual` Reviews feed the scheduler. A `manual` Review records the Learner saying "I know this" and is fed in as Easy. Learn quizzes, Wrap-Up re-asks, Ghosts, Cram and lookups are logged with their own `kind` but ignored.
- Moving to FSRS-7 later means rebuilding every item's state from its full log, which only works because nothing is ever deleted from the log.
