# Grammar Points: seed and links

Decided in [#20](https://github.com/LorexGitHub/ibbun/issues/20). Terms follow [CONTEXT.md](../CONTEXT.md). The graph shape is in [content-graph.md](content-graph.md). Why hanabira is imported once, not refreshed, is in [ADR 0006](adr/0006-grammar-points-seeded-once.md).

No open dataset is good enough on its own. hanabira has 828 JLPT-tagged points (CC BY 4.0, authorship unknown, probably machine-written). Tanos has N5–N1 grammar lists (CC BY, from 2010, N3/N2 levels estimated). No open data links Sentences to Grammar Points, and no open source has Japanese Explanations for them ([research #24](https://github.com/LorexGitHub/ibbun/issues/24)).

## Scope

Only N5–N1 Grammar Points are seeded. ibbun is built for JLPT learners. Unlevelled Grammar Points (Kansai-ben, non-JLPT extras) stay possible in the schema and need their own issue.

## Inventory

1. Parse hanabira's 828 points and the Tanos N5–N1 grammar lists. Do **not** ingest the Tanos N1/N2 "grammar usage" pages: they come from Kanzen Master.
2. Merge them into one list. An LLM proposes which hanabira point matches which Tanos entry. Each proposal goes into the Content Approval queue with a reason tag.
3. Split and join points by the rule below.
4. Every resulting Grammar Point arrives `draft`. hanabira's text is the starting point for its fields. Generation fills in any required field that is missing or rejected.

### One Grammar Point per meaning

- Contractions and casual or polite variants are **forms** of one Grammar Point, the same way a Word has several written forms (てしまう / ちゃう).
- One pattern with two unrelated meanings is **two** Grammar Points (ように "so that" and ように "like").
- Where hanabira and Tanos split a point differently, a reviewer decides, using this rule.

## Fields

| Field | Required for approval | Notes |
|---|---|---|
| Title | yes | The pattern in Japanese, such as 〜てしまう |
| Forms | yes, at least one | Surface variants, each tagged `casual` or `polite` |
| Formation | yes | Structured slots (V-て + しまう), not free text. Matcher Rules are written against it |
| Register | yes | `casual`, `neutral`, `polite` or `formal` |
| English meaning | yes | Short, like a Word sense gloss |
| Japanese Explanation | yes | Generated through Content Approval ([content-approval.md](content-approval.md)). The reviewer sees any matching ja Wiktionary entry as reference |
| JLPT Level assignment | yes | See below |
| Matcher Rule | yes, and it must pass | See below |
| Notes | no | English usage notes. hanabira's long explanation starts here |
| **relates to** links | no | Kind (see also, contrast) plus a short comparison text |

There are no lesson, order or prerequisite fields. Order belongs to the Learning Path.

Approved Examples are not required to approve a Grammar Point. Until one is approved, the point is Suspended.

## JLPT Level

The rule below picks the seeded **List** Level Candidate. Later corrections are Editorial candidates, which outrank it ([jlpt-levels.md](jlpt-levels.md)).

| hanabira | Tanos | Level | Flagged for a reviewer |
|---|---|---|---|
| has it | same level | that level | no |
| has it | missing | hanabira's | no |
| missing | has it | Tanos's | no |
| has it | different level | **hanabira's** (newer, set on the N-scale) | yes, showing both |

## hanabira is imported once

hanabira is a one-time seed, not a refreshed dataset. It gets no schedule, no Import Runs after the first, and no Override layer. After the seed, Grammar Points are ibbun-owned. Provenance records "seeded from hanabira at commit X" (or the Tanos list), which is all the CC BY credits need ([ADR 0006](adr/0006-grammar-points-seeded-once.md)).

## Sentence demonstrates Grammar Point

Three sources, all arriving `draft`:

1. **hanabira's example sentences.** Imported as `draft` Sentences with Provenance hanabira, each with a `draft` demonstrates link to its point. They are candidate Examples, which matters most at N1, where Tatoeba rarely matches.
2. **Matcher Rules** run over every Sentence and propose links. A reviewer agent confirms or rejects each one. A matcher can't tell meanings apart (ように "so that" vs "like"), so it only proposes.
3. **Generation** tops up any Grammar Point with fewer approved Examples than the target, after the matcher has run.

### Example target

**5 approved Examples per Grammar Point**, as a config value. That is about 4k Examples across the seed. If Learners see the same Sentences too often, raise it to 10 in a later issue.

### Matcher Rule

- **Format.** A token pattern over the Sudachi tokens already stored on each Sentence: a sequence of lemma, part of speech and conjugation form, with optional gaps. It is data on the Grammar Point, not code.
- **Origin.** Generated with the Grammar Point and approved with it. Approval runs the rule against the point's own example Sentences, and the rule must match every one.
- **Reruns.** A rerun proposes new `draft` links only. Decisions already made are kept, keyed by (Sentence, Grammar Point, span).
- **Sentence edits.** When a Sentence's text changes, its demonstrates links go back to `draft`, the same as Examples ([import-pipeline.md](import-pipeline.md)).
- **Not derived.** These links carry an approval decision, so they are not part of the derived-link cache and are never wiped by a rebuild.

## Where the code goes

- The `import` slice parses hanabira and Tanos once, and runs Matcher Rules as a `worker` job.
- Merging, splitting, the level rule, the approval gate and Matcher Rule evaluation are domain rules. They live in core `content-graph/authoring`.
- `content-generation` drafts missing fields, Japanese Explanations, Matcher Rules and top-up Sentences.
- `content-approval` holds the queue: merge proposals, level conflicts, Grammar Points and demonstrates links.
- `credits` shows hanabira (with a link to https://hanabira.org) and Waller (with a link) ([#19](https://github.com/LorexGitHub/ibbun/issues/19)).
