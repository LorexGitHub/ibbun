import type { Clock, QueueEntry } from "../authoring/authoring.ts";
import { rules, systemClock } from "../authoring/authoring.ts";
import type { Store } from "../authoring/store.ts";

/** A Learner's "my answer was right" flag on one graded facet (review-answer-model.md#my-answer-was-right-flags). */
export type NewAnswerFlag = { exampleId: string; reviewId: string; facet: string; input: string };

/**
 * The write a Learner-facing slice may make into the Content Approval queue: an `answer flag` entry.
 * The Example is the entry's record and `{reviewId, facet, input}` is its detail. Learner-facing slices
 * may not import `content-graph/authoring`, so this is their only way in.
 */
export type AnswerFlags = {
  /** Queues the flag. Flagging the same Review facet again changes nothing, so a retry or a double click is safe. */
  flag(flag: NewAnswerFlag): Promise<void>;
};

const isFlagOf = ({ reviewId, facet }: NewAnswerFlag) => (entry: QueueEntry) => {
  const detail = entry.detail as Partial<NewAnswerFlag> | null;
  return detail?.reviewId === reviewId && detail.facet === facet;
};

export const answerFlags = (s: Store, clock: Clock = systemClock): AnswerFlags => ({
  flag: (flag) =>
    s.atomically(async (tx) => {
      const asked = await tx.rows("queueEntry", { reason: "answer flag", recordId: flag.exampleId });
      if (asked.some(isFlagOf(flag))) return;
      const { exampleId, ...detail } = flag;
      await rules(tx, clock).enqueue({ reason: "answer flag", recordId: exampleId, detail });
    }),
});
