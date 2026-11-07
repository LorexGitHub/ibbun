import type { Authoring, Decider, DecisionOutcome, GenerationRequest } from "@mojibun/content-graph/authoring";
import { ContentGenerate } from "@mojibun/content-graph/jobs";
import type { Jobs } from "@mojibun/jobs";
import type { Llm } from "@mojibun/llm";
import type { Nlp } from "@mojibun/nlp";
import { checkExample, checkExplanation, type ExampleCheck, type ExplanationCheck } from "./checks.ts";
import type { ApprovalConfig } from "./config.ts";
import { draftsOfRun, type Draft } from "./drafts.ts";
import { review, type Judgement, type Review } from "./reviewer.ts";

export type ReviewDeps = { authoring: Authoring; nlp: Nlp; llm: Llm; jobs: Jobs; config: ApprovalConfig };

const CHECKS: Decider = { kind: "derived", process: "content-approval/automatic-checks", version: "1" };

type Result = Judgement;

/** Records one Approval Decision per record of the unit; an escalation is recorded on the primary record only. */
const decideUnit = async (a: Authoring, draft: Draft, outcome: DecisionOutcome, decider: Decider, reason?: string, verdicts: Review["verdicts"] = []) => {
  const records = outcome === "escalated" ? [draft.primary] : draft.records;
  for (const { table, id } of records) await a.decide({ recordTable: table, recordId: id, outcome, decider, reason, verdicts });
};

const automatic = (a: Authoring, d: ReviewDeps, draft: Draft): Promise<ExampleCheck | ExplanationCheck> =>
  draft.kind === "example" ? checkExample(a, d.nlp, d.config, draft) : checkExplanation(a, draft);

/** Checks one draft, then (only if it passed) asks the reviewer, and records the decision. */
const decideDraft = async (d: ReviewDeps, draft: Draft): Promise<Result> => {
  const a = d.authoring;
  const check = await automatic(a, d, draft);
  if (draft.kind === "example") await a.update("sentence", { id: draft.sentence.id }, { tokens: (check as ExampleCheck).tokens });
  if (check.failures.length) {
    const reason = check.failures.map((f) => `${f.check}: ${f.message}`).join("\n");
    await decideUnit(a, draft, "rejected", CHECKS, reason);
    return { outcome: "rejected", reason };
  }
  const { judgement, verdicts, model, rubric } = await review(d.llm, d.config.minConfidence, draft, check);
  const decider: Decider = { kind: "reviewer", model, rubricVersion: rubric.version };
  await decideUnit(a, draft, judgement.outcome, decider, "reason" in judgement ? judgement.reason : undefined, verdicts);
  return judgement;
};

/** One rejection in the run uses the request's one attempt; the reasons go to the generator as feedback. */
const retry = async (d: ReviewDeps, requestId: string, reasons: string[]) => {
  const request = await d.authoring.failAttempt(requestId);
  if (request.status === "open") await d.jobs.enqueue(ContentGenerate, { requestId, feedback: reasons.join("\n") });
};

/** The drafts still to decide. Finished and failed requests have none; an open request whose run wrote nothing is a fault. */
const draftsToReview = async (a: Authoring, request: GenerationRequest, runId: string): Promise<Draft[]> => {
  if (request.status === "done" || request.status === "failed") return [];
  const drafts = await draftsOfRun(a, request.kind, runId);
  if (!drafts.length && request.status === "open") throw new Error(`Generation Run ${runId} wrote no draft to review`);
  return drafts;
};

/** One rejection in the run uses the request's one attempt; it is done only when every draft was approved. */
const settle = async (d: ReviewDeps, requestId: string, results: Result[]) => {
  const rejected = results.flatMap((r) => (r.outcome === "rejected" ? [r.reason] : []));
  if (rejected.length) return retry(d, requestId, rejected);
  if (results.every((r) => r.outcome === "approved")) await d.authoring.setGenerationStatus(requestId, "done");
};

/**
 * `content.review`: tokenise, check, review and decide every draft a Generation Run wrote
 * (docs/content-approval.md#pipeline). Running it again after a crash only handles drafts still undecided.
 */
export const reviewRun = async (d: ReviewDeps, { requestId, runId }: { requestId: string; runId: string }) => {
  const [request] = await d.authoring.rows("generationRequest", { id: requestId });
  if (!request) throw new Error(`no Generation Request ${requestId}`);
  const drafts = await draftsToReview(d.authoring, request, runId);
  if (!drafts.length) return;
  await d.authoring.setGenerationStatus(requestId, "in review");
  const results: Result[] = [];
  for (const draft of drafts) results.push(await decideDraft(d, draft));
  await settle(d, requestId, results);
};
