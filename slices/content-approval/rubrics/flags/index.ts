import { randomUUID } from "node:crypto";
import type { Authoring, Decider, QueueEntry, Row } from "@ibbun/content-graph/authoring";
import type { Llm } from "@ibbun/llm";
import { levelOf } from "../../src/checks.ts";
import type { ApprovalConfig } from "../../src/config.ts";
import { judge, ReviewerAnswer, type Judgement } from "../../src/reviewer.ts";
import { fill, rubricFor } from "../../src/rubrics.ts";

/** What the reviews slice attaches to an `answer flag` entry: the graded facet and the input, with the Example as the entry's record (review-answer-model.md#my-answer-was-right-flags). */
export type AnswerFlagDetail = { reviewId: string; facet: string; input: string };

export type FlagDeps = { authoring: Authoring; llm: Llm; config: ApprovalConfig };

const rubric = () => rubricFor("flags");

/** The same normalisation the grader applies: NFKC, trimmed, and the final 。！？ removed (review-answer-model.md#matching). */
const normalise = (input: string) => input.normalize("NFKC").trim().replace(/[。！？]$/u, "");

const detailOf = (entry: QueueEntry): AnswerFlagDetail => {
  const { reviewId, facet, input } = (entry.detail ?? {}) as Partial<AnswerFlagDetail>;
  if (typeof reviewId !== "string" || typeof facet !== "string" || typeof input !== "string") throw new Error(`answer flag ${entry.id} has no review, facet and input`);
  return { reviewId, facet, input };
};

const lines = (answers: Row<"exampleAnswer">[]) => answers.map((x) => `- ${x.written}${x.reading ? ` (${x.reading})` : ""}`).join("\n") || "none";

/** An Accepted Answer is an authored override: it has its own Provenance, so a refresh keeps it. */
const addAcceptedAnswer = async (a: Authoring, exampleId: string, written: string): Promise<string> => {
  const provenanceId = randomUUID();
  await a.insert("provenance", [{ id: provenanceId, source: { kind: "authored", by: "learner answer flag" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] }]);
  const id = randomUUID();
  await a.insert("exampleAnswer", [{ id, exampleId, kind: "accepted", written, reading: null, message: null, approval: "draft", retired: false, provenanceId }]);
  return id;
};

/** Escalates without writing an answer: whatever the flag points at, a person decides. */
const escalate = async (a: Authoring, entry: QueueEntry, reason: string): Promise<Judgement> => {
  await a.enqueue({ reason: "escalated", recordId: entry.recordId, detail: { from: entry.reason, reason } });
  await a.resolve(entry.id);
  return { outcome: "escalated", reason };
};

/** The Example behind a flag, with what the reviewer is shown; or why a person must decide instead. */
const contextOf = async (a: Authoring, entry: QueueEntry, input: string) => {
  const [example] = entry.recordId ? await a.rows("example", { id: entry.recordId }) : [];
  if (!example) return "the flagged facet has no Example to add an accepted answer to";
  const answers = (await a.rows("exampleAnswer", { exampleId: example.id })).filter((x) => x.approval === "approved" && !x.retired);
  const accepted = answers.filter((x) => x.kind === "accepted");
  if (input === "" || accepted.some((x) => x.written === input || x.reading === input)) return "the input is empty or already accepted, so the grader's miss is not an answer to add";
  const [sentence] = await a.rows("sentence", { id: example.sentenceId });
  if (!sentence) throw new Error(`Example ${example.id} has no Sentence`);
  const values = {
    level: String(await levelOf(a, example.studyItemId)),
    text: sentence.text,
    translation: sentence.translationEn ?? "none",
    span: sentence.text.slice(example.spanStart, example.spanEnd),
    accepted: lines(accepted),
    knownWrong: lines(answers.filter((x) => x.kind === "known_wrong")),
  };
  return { example, values };
};

/**
 * Reviews one `answer flag`. An approved flag adds one Accepted Answer to the Example through its own Approval Decision;
 * the past Review is never regraded. A rejected flag adds a rejected answer, so the decision is on record and nothing is graded differently.
 */
export const reviewAnswerFlag = async (d: FlagDeps, entry: QueueEntry): Promise<Judgement> => {
  const a = d.authoring;
  const { facet, input: typed } = detailOf(entry);
  const input = normalise(typed);
  const context = await contextOf(a, entry, input);
  if (typeof context === "string") return escalate(a, entry, context);

  const r = rubric();
  const result = await d.llm.review({
    system: `Judge the flag against every criterion. Rubric ${r.version}.`,
    prompt: fill(r.template, { ...context.values, facet, input }),
    output: ReviewerAnswer,
  });
  const judgement = judge(r.criteria, result.output, d.config.minConfidence);
  const verdicts = result.output.verdicts.map((v) => ({ criterion: v.criterion, pass: v.pass, note: v.note }));
  const decider: Decider = { kind: "reviewer", model: result.model, rubricVersion: r.version };

  const answerId = await addAcceptedAnswer(a, context.example.id, input);
  const reason = "reason" in judgement ? judgement.reason : undefined;
  await a.decide({ recordTable: "exampleAnswer", recordId: answerId, outcome: judgement.outcome, decider, reason, verdicts });
  await a.resolve(entry.id);
  return judgement;
};

/** Reviews every open `answer flag`. A flag is resolved once decided, so running again only meets what is still open. */
export const reviewAnswerFlags = async (d: FlagDeps): Promise<Judgement[]> => {
  const outcomes: Judgement[] = [];
  for (const entry of await d.authoring.queue({ reason: "answer flag" })) outcomes.push(await reviewAnswerFlag(d, entry));
  return outcomes;
};
