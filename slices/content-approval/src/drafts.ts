import type { Authoring, RecordTable, Row } from "@ibbun/content-graph/authoring";
import { grammarFieldsDrafts, type GrammarFieldsDraft } from "../rubrics/grammar-fields/index.ts";

export type Rec = { table: RecordTable; id: string };

/** A drafted Example, reviewed as one unit with its Sentence, answer data and links (content-approval.md#units-of-approval). */
export type ExampleDraft = {
  kind: "example";
  /** The record the reviewer's escalation and the queue point at. */
  primary: Rec;
  /** Every record the unit's decision applies to; the primary is last so Suspension checks see the others decided. */
  records: Rec[];
  example: Row<"example">;
  sentence: Row<"sentence">;
  answers: Row<"exampleAnswer">[];
};

export type ExplanationDraft = {
  kind: "japanese-explanation";
  primary: Rec;
  records: Rec[];
  explanation: Row<"japaneseExplanation">;
};

export type Draft = ExampleDraft | ExplanationDraft | GrammarFieldsDraft;

/** The rubric kind a Generation Request kind is reviewed under, or undefined when this slice has no rubric for it. */
export const RUBRIC_KIND: Record<string, Draft["kind"] | undefined> = {
  examples: "example",
  answer_data: "example",
  japanese_explanation: "japanese-explanation",
  "grammar-fields": "grammar-fields",
};

const rec = (table: RecordTable, id: string): Rec => ({ table, id });

/** Ids of the Provenance rows written for a Generation Run. */
const provenanceOfRun = async (a: Authoring, runId: string): Promise<string[]> =>
  (await a.rows("provenance"))
    .filter((p) => p.source.kind === "generated" && p.source.generationRunId === runId)
    .map((p) => p.id);

const inEachProvenance = async <T>(ids: string[], read: (provenanceId: string) => Promise<T[]>): Promise<T[]> =>
  (await Promise.all(ids.map(read))).flat();

/** The unit an Example is decided with; `answers` picks which of its answer data belong to it (the drafts, or a live unit's approved ones). */
export const exampleDraft = async (a: Authoring, example: Row<"example">, answers: "draft" | "approved" = "draft"): Promise<ExampleDraft> => {
  const [sentence] = await a.rows("sentence", { id: example.sentenceId });
  if (!sentence) throw new Error(`Example ${example.id} has no Sentence`);
  const unitAnswers = (await a.rows("exampleAnswer", { exampleId: example.id })).filter((x) => x.approval === answers);
  const links = [
    ...(await a.rows("sentenceUsesWord", { sentenceId: sentence.id })).map((l) => rec("sentenceUsesWord", l.id)),
    ...(await a.rows("sentenceDemonstratesGrammar", { sentenceId: sentence.id })).map((l) => rec("sentenceDemonstratesGrammar", l.id)),
  ];
  const primary = rec("example", example.id);
  const records = [rec("sentence", sentence.id), ...unitAnswers.map((x) => rec("exampleAnswer", x.id)), ...links, primary];
  return { kind: "example", primary, records, example, sentence, answers: unitAnswers };
};

/** The drafts a Generation Run wrote for a request of this kind, still awaiting a decision. */
export const draftsOfRun = async (a: Authoring, requestKind: string, runId: string): Promise<Draft[]> => {
  const kind = RUBRIC_KIND[requestKind];
  if (!kind) throw new Error(`no rubric for Generation Request kind "${requestKind}"`);
  const ids = await provenanceOfRun(a, runId);
  if (kind === "example") {
    const examples = await inEachProvenance(ids, (provenanceId) => a.rows("example", { provenanceId, approval: "draft" }));
    return Promise.all(examples.map((example) => exampleDraft(a, example)));
  }
  if (kind === "grammar-fields") return grammarFieldsDrafts(a, runId);
  const explanations = await inEachProvenance(ids, (provenanceId) => a.rows("japaneseExplanation", { provenanceId, approval: "draft" }));
  return explanations.map((explanation) => {
    const primary = rec("japaneseExplanation", explanation.id);
    return { kind, primary, records: [primary], explanation };
  });
};
