import type { Authoring, GenerationRun, QueueReason } from "@ibbun/content-graph/authoring";

export const CONFIDENCE = ["high", "medium", "low"] as const;

/** A proposal is not a record: it waits in the Content Approval queue, and approving it is what changes the graph. */
export const enqueueProposal = (auth: Authoring, run: GenerationRun, reason: QueueReason, recordId: string, detail: unknown) =>
  auth.enqueue({ reason, recordId, generationRunId: run.id, generationRequestId: run.requestId, detail });
