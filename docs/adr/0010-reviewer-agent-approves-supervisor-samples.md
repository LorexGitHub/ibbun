# The reviewer agent approves; the supervisor samples afterwards

ibbun needs tens of thousands of approved records before Learners can use it: about 4k Grammar Point Examples, Examples for some 10k Words and 2.1k levelled Kanji, answer data for every Example, Japanese Explanations, and a Batch Text per Learner per Learn batch. There is one human supervisor. If every record waited for that person, nothing would ship, and Batch Texts, which have to be ready within seconds, could not exist at all.

So the reviewer agent's approval is final, and content is live as soon as the reviewer approves it. Deterministic checks run first, so the reviewer never sees a draft with a wrong level, a missing target or a duplicate. The reviewer is a different, stronger model than the generator, and judges each draft against a versioned rubric without seeing the generator's reasoning. It can approve, reject or escalate, but never edit. The supervisor sees escalations, operational alerts and a random 5% sample per content kind. They also see every approval for the first 20 decisions after a rubric, prompt or model changes. If the supervisor rejects more than 10% of the last 50 samples in a kind, auto-approval for that kind pauses until the supervisor resumes it.

## Considered Options

- **Supervisor approves everything.** The safest option, and it does not scale to one person. It also rules out per-Learner Batch Texts.
- **Supervisor approves a sample *before* the rest goes live.** It holds whole batches back for a person and gives no protection for content generated on demand.
- **The reviewer may fix small mistakes itself.** It would be faster, but the fixed text would have no independent review. A rejection with a reason, fed back to the generator, keeps every live record reviewed by a model that did not write it.
- **Same model for generating and reviewing.** It is cheaper, but it tends to share the generator's blind spots.

## Consequences

- A wrong record can reach Learners before anyone sees it. The sample bounds how long a bad rubric goes unnoticed, and calibration catches most problems right after a change.
- A spot-check rejection retires the record if a Learner has met it, so past Reviews still make sense. A replacement is requested automatically.
- Every decision is an append-only Approval Decision with the decider's model and rubric version, so bad approvals can be found and re-reviewed by run, rubric or model.
- The error-rate pause turns a failing rubric into a backlog for the supervisor instead of a stream of bad live content.
