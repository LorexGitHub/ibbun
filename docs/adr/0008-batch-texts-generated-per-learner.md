# Batch Texts are generated per Learner and approved like any other content

After each Learn batch, the Learner reads a short text that uses every Study Item in the batch ([batch-text.md](../batch-text.md)). Batches are unique to each Learner, because the Learning Path shuffles order per Learner (#15), so no text written in advance can cover a batch. We generate one per Learner when the batch is picked, and it goes through the normal #4 Content Approval: automatic checks, then the reviewer agent, then supervisor spot-checks.

This looked like it conflicted with "content reaches Learners only after Content Approval". It doesn't. Under #4, approval of generated content was already done by checks and the reviewer agent, never by a person, so a per-Learner text can be approved in the same way. The cost is waiting time: generation and review run while the Learner does the lesson and quiz.

The passage lives in the Content Graph like any Reading Passage. Which Learner it belongs to, its episode number and the running story summary are Learner data, so they live in `progress`.

## Considered Options

- **Stitch a text from the batch's approved Examples.** It needs no new content, but the Learner has just seen those Sentences in the lesson and quiz, so it adds almost nothing. It was dropped even as a fallback.
- **A lighter "checked but not approved" tier for content only one Learner sees.** It would be faster, but it adds a second trust level to the glossary and to every read path.
- **Pre-generate texts per level.** They can't cover a shuffled batch, and covering every batch combination is impossible.
- **Keep the Batch Text record in `content-graph`.** That would put Learner data into a graph defined as facts that say nothing about any Learner.

## Consequences

- One LLM generation and one reviewer-agent call per batch, plus up to 2 retries. The daily new-item budget bounds the cost.
- A Batch Text may be late. The Learner waits up to 20 s, then reads it later from `reading`. A batch whose text fails 3 times has none.
- A job contract can now live in core, so a Learner-facing slice (`learn`) can enqueue work that an admin slice (`content-generation`) handles.
- Generated Sentences pile up in the Content Graph. They are approved content and can become Examples, but only through their own approval.
