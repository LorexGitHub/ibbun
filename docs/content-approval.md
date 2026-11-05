# Content generation and Content Approval

Decided in [#16](https://github.com/LorexGitHub/mojibun/issues/16). Terms follow [CONTEXT.md](../CONTEXT.md). Why the reviewer agent has the final say is in [ADR 0010](adr/0010-reviewer-agent-approves-supervisor-samples.md). The policy comes from [#4](https://github.com/LorexGitHub/mojibun/issues/4): generated content uses the same schema as dataset content, passes automatic checks, is approved by a reviewer agent, and the supervisor spot-checks a sample.

## Pipeline

```
trigger ─▶ Generation Request ─▶ Generation Run (llm) ─▶ draft
                ▲                                          │
                │  failed check / reviewer reject           ▼
                └──── (up to 3 attempts) ◀──── automatic checks ─▶ reviewer agent ─▶ approve │ reject │ escalate
                                                                                      │
                                                         supervisor samples ◀─────────┘
```

1. A **trigger** creates a Generation Request.
2. `content-generation` runs the generator model and writes the result as a `draft`, with `generated` Provenance pointing at the Generation Run.
3. `content-approval` tokenises the draft with Sudachi, stores the tokens, and runs the [automatic checks](#automatic-checks). A failure never reaches the reviewer. The failures go back to the generator as feedback.
4. The reviewer agent applies the rubric for the content kind and records an [Approval Decision](#approval-decisions).
5. Approved content is live at once. The supervisor sees escalations and [samples](#supervisor-spot-checks).

Every Generation Request gets **3 attempts** (config). Each failed check or reviewer rejection uses one. After the third, the request goes into the Content Approval queue with reason `generation failed`.

## What is generated

| Kind | Target | Needed by |
|---|---|---|
| Example Sentence | a Word, a levelled Kanji or a Grammar Point | Suspended items ([import-pipeline.md](import-pipeline.md#suspended-study-items)), Kanji Examples ([#18](https://github.com/LorexGitHub/mojibun/issues/18)), Grammar Point top-ups to 5 ([grammar-points.md](grammar-points.md)) |
| Answer data | an Example: alternates, known wrong answers, hint, comprehension questions | every Example, Tatoeba ones included ([#18](https://github.com/LorexGitHub/mojibun/issues/18)) |
| Japanese Explanation | a Word sense or Grammar Point | gaps left by ja Wiktionary, and every Grammar Point (#24) |
| Grammar Point fields and Matcher Rule | a Grammar Point | missing or rejected fields after the seed ([grammar-points.md](grammar-points.md)) |
| Proposal | hanabira↔Tanos merges, Wiktionary gloss → JMdict sense alignment | the Grammar Point seed and the Japanese Explanation seed |
| Reading Passage | a set of target Words and Grammar Points, and a JLPT Level | Batch Texts ([batch-text.md](batch-text.md)), Practice Texts ([listening.md](listening.md#practice-texts)) and any other passage request |
| Listening dialogue | a levelled Grammar Point | one dialogue Listening Clip per levelled Grammar Point, with its 2 comprehension questions ([listening.md](listening.md#dialogues)) |
| Audio | a Sentence, or a dialogue line | Sentence Audio and Listening Clips; made by VOICEVOX, not an LLM ([below](#listening-clips)) |

Bulk Word level proposals are still deferred ([jlpt-levels.md](jlpt-levels.md)). When they come, they use this pipeline.

## Generation Requests and Runs

A **Generation Request** is (target record, kind, reason, attempt count, status). It is idempotent per (target, kind): a second trigger for the same pair while one is open does nothing.

| Status | Meaning |
|---|---|
| `open` | waiting for the generator |
| `in review` | a draft exists and is being checked or reviewed |
| `done` | a draft was approved |
| `failed` | 3 attempts used; in the queue as `generation failed` |

Triggers, all automatic unless noted:

- a Study Item becomes Suspended;
- a Grammar Point has fewer approved Examples than the target, after the Matcher Rule has run;
- a required field (Japanese Explanation, Grammar Point field) is missing or rejected;
- an Example has no answer data;
- `batch-text.generate` and `practice.generate`;
- a levelled Grammar Point has no dialogue Listening Clip;
- a spot-check retires an Example ([below](#supervisor-spot-checks));
- an admin queues one by hand.

A **Generation Run** is one LLM call made for a request. It records the model, the prompt-template version, every input placed in the prompt, the token count and the cost. Generated Provenance points at it, the way imported Provenance points at an Import Run.

### Models

Generator and reviewer are **different models**, both config values: the generator a cheaper one (Sonnet 5.5), the reviewer a stronger one (Opus 5.5). The reviewer sees the draft and its inputs, never the generator's reasoning.

### Budget

A daily token budget (config) covers generator and reviewer calls together. When it is spent, generation and review pause and an alert with reason `budget exhausted` goes to the queue. A Batch Text that can't be made in time is read later from `reading`, as [batch-text.md](batch-text.md) already allows.

## Automatic checks

Deterministic, run over stored Sudachi tokens before the reviewer sees anything. Each is a pure function in core `content-graph/authoring`. The `content-approval` slice runs Sudachi and stores the tokens first, because only admin slices may call `nlp`.

**Sentences** (generated Examples, and each Sentence of a Reading Passage):

1. Every content token links to a JMdict Word.
2. **Readings.** The generator returns its own kana reading. Where it disagrees with Sudachi, the draft still goes to the reviewer, with both readings shown. Sudachi misreads numbers and counters ([#11](https://github.com/LorexGitHub/mojibun/issues/11)), so a disagreement is not a failure.
3. **Level.** The computed level is at or below the target's JLPT Level.
4. **Unlevelled Words.** None, except at N1, where one is allowed (the target itself may be Unlevelled).
5. **Target.** It appears exactly once and its span resolves.
6. An English translation is present.
7. Not a duplicate or near-duplicate of an existing Sentence.
8. Within the length cap for its level (config).

**Japanese Explanations:** Japanese only (no Latin script), no use of the headword itself, and every Kanji is levelled or jōyō.

**Matcher Rules:** the rule matches every one of its Grammar Point's own example Sentences ([grammar-points.md](grammar-points.md#matcher-rule)).

**Reading Passages:** checks 1, 2 and 6–8 per Sentence, every target appears, and the passage's computed level is at or below the requested level. Batch Texts use their own Learner-aware checks in place of 3 and 4 ([batch-text.md](batch-text.md#automatic-checks)).

## The reviewer agent

### Outcomes

| Outcome | Effect |
|---|---|
| **approve** | the record is `approved` and live at once |
| **reject**, with a reason | the record is `rejected`; the reason goes to the generator as feedback and uses one attempt |
| **escalate** | the record stays `draft` and goes to the supervisor with reason `escalated` |

The reviewer never edits a draft. An edit would be content that nobody reviewed independently.

### Rubrics

Each content kind has its own rubric, kept as a versioned prompt template in the `content-approval` slice. The reviewer returns a structured verdict, pass or fail per criterion, and any fail means reject. For example, an Example is checked for natural Japanese, an accurate translation, the target used in the intended sense, the reading where Sudachi disagreed, a fair blank, and correct, complete answer data.

### What it handles

Every content draft, whatever made it: generated content, Tatoeba Examples, hanabira Sentences, Matcher Rule proposals, merge and sense-alignment proposals, `level disagreement`, `stale override`, `orphaned override`, `superseded`, `example redrafted`, `unmatched sense`, and Learner answer flags ([#18](https://github.com/LorexGitHub/mojibun/issues/18)).

These reasons are operational and always go straight to the supervisor: `breaker tripped`, `budget exhausted`, `generation failed`, and the staleness alarm ([#19](https://github.com/LorexGitHub/mojibun/issues/19)).

### When it escalates

- its own confidence is low;
- two readings are both acceptable (今日 きょう / こんにち);
- any new **Editorial** Level Candidate: a level judgement is the supervisor's call ([jlpt-levels.md](jlpt-levels.md)).

### Units of approval

- An **Example and its answer data** are generated (or, for a Tatoeba Example, completed) and reviewed as one unit, approved or rejected together. A later Learner flag that is accepted adds one accepted answer through its own Approval Decision.
- A **Reading Passage and all its Sentences** are reviewed and approved atomically.
- A **dialogue, its Sentences and both comprehension questions** are reviewed and approved atomically ([listening.md](listening.md#dialogues)).

## Listening Clips

A dialogue's text and questions are generated and reviewed like any draft ([listening.md](listening.md#dialogues)). Single-Sentence clips are picked from approved Examples by a fixed rule, with no LLM. The **audio** for either never involves an LLM. Audio is built from its Sentence's **approved** reading with a voice from the allow-list ([#11](https://github.com/LorexGitHub/mojibun/issues/11)). It is approved automatically when the kana string sent to VOICEVOX equals the approved reading, like a Derived record, with Provenance "derived by process X, version Y" plus engine, voice and speed. The reviewer agent can't judge pitch or audio, so the supervisor samples clips by listening.

## Approval Decisions

Every decision is an append-only **Approval Decision** row: record, outcome (`approved` | `rejected` | `escalated` | `retired`), decider (reviewer agent with model and rubric version, the supervisor, or a derived process), per-criterion verdicts, reason and time. A record's approval state is its latest decision. Nothing about a decision is ever overwritten.

## Supervisor spot-checks

- **Sample.** A random **5%** of the reviewer's approvals in each content kind.
- **Calibration.** **Every** approval in the first **20** decisions after a rubric, prompt-template or model version changes.
- **Error rate.** The supervisor's verdicts on samples give a running error rate per kind. If more than **10%** of the last **50** sampled items in a kind are rejected, auto-approval for that kind **pauses**: the reviewer's approvals wait for the supervisor until the supervisor resumes the kind.
- **Listening Clips** are sampled the same way, by listening.

All four numbers are config.

### When a spot-check rejects live content

- If any Learner has met the record, it is **Retired**; otherwise it is **Rejected**.
- A Retired Example triggers a Generation Request to top up its target. A target left with no approved Example is Suspended, which triggers one as usual.
- Other approvals from the same run are **not** re-reviewed automatically. The supervisor can queue a re-review with a filter: by Generation Run, rubric version or model.
- A rubric or model change never re-reviews old approvals on its own.

## Provenance of generated content

`generated` Provenance holds the model, the prompt-template version, the Generation Run and the inputs: every record or text placed in the prompt. The licence rules of [#19](https://github.com/LorexGitHub/mojibun/issues/19) derive the licence from those inputs; a Wiktionary gloss in the prompt makes the output ShareAlike. The Approval Decisions say who approved it. Both are kept forever and never shown to Learners.

## Wiring

| Where | Owns |
|---|---|
| core `content-graph/authoring` | `generation_request`, `generation_run` and `approval_decision` tables (additive); the automatic checks; the Content Approval queue entries |
| core `content-graph` | job contracts `content.generate`, `content.review` and `listening.synthesise` (name plus Zod payload), next to `batch-text.generate` and `practice.generate` |
| `content-generation` | handles `content.generate`, `batch-text.generate`, `practice.generate` and `listening.synthesise`: prompts, calls `llm`, writes drafts and Generation Runs, enqueues `content.review`, picks single-Sentence clips, synthesises audio |
| `content-approval` | handles `content.review`: Sudachi, automatic checks, reviewer agent, Approval Decisions; on reject, enqueues `content.generate` for the next attempt. Also the queue screens, spot-check sampling, error rates, pause and resume, the budget alert. Sampling state is private to the slice |

Generation Requests live in core because triggers come from several places: `applySnapshot()` (Suspended items), the Grammar Point seed, `learn` (Batch Texts) and both admin slices. The two new job contracts extend the exception in [ADR 0008](adr/0008-batch-texts-generated-per-learner.md): the two admin slices hand work to each other without importing each other.
