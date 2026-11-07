import type { ReadingDisagreement } from "@mojibun/content-graph/authoring";
import type { Verdict } from "@mojibun/content-graph/authoring";
import type { Llm } from "@mojibun/llm";
import { z } from "zod";
import type { ExampleCheck, ExplanationCheck } from "./checks.ts";
import type { ExampleDraft, ExplanationDraft } from "./drafts.ts";
import { fill, rubricFor, type Rubric } from "./rubrics.ts";

/** What the reviewer agent answers: one verdict per criterion, how sure it is, and whether two readings both stand. */
export const ReviewerAnswer = z.object({
  verdicts: z.array(z.object({ criterion: z.string(), pass: z.boolean(), note: z.string() })),
  confidence: z.number(),
  bothReadingsAcceptable: z.boolean(),
});
export type ReviewerAnswer = z.output<typeof ReviewerAnswer>;

export type Judgement =
  | { outcome: "approved" }
  | { outcome: "rejected"; reason: string }
  | { outcome: "escalated"; reason: string };

/** Any failed (or missing) criterion rejects; low confidence or two acceptable readings escalate; otherwise approve. */
export const judge = (criteria: readonly string[], answer: ReviewerAnswer, minConfidence: number): Judgement => {
  const failed = criteria.flatMap((criterion) => {
    const verdict = answer.verdicts.find((v) => v.criterion === criterion);
    return verdict?.pass ? [] : [`${criterion}: ${verdict?.note || "no verdict given"}`];
  });
  if (failed.length) return { outcome: "rejected", reason: failed.join("; ") };
  if (answer.bothReadingsAcceptable) return { outcome: "escalated", reason: "two readings are both acceptable" };
  if (answer.confidence < minConfidence) return { outcome: "escalated", reason: `reviewer confidence ${answer.confidence} is low` };
  return { outcome: "approved" };
};

const readings = (found: ReadingDisagreement[]): string =>
  found.length ? found.map((r) => `generator ${r.generator}, Sudachi ${r.sudachi}`).join("\n") : "none";

const answerLines = (draft: ExampleDraft): string =>
  draft.answers.map((x) => `- ${x.kind}: ${x.written}${x.reading ? ` (${x.reading})` : ""}${x.message ? ` — ${x.message}` : ""}`).join("\n") || "none";

/** The rubric for the draft and the values its template needs. */
const promptFor = (draft: ExampleDraft | ExplanationDraft, check: ExampleCheck | ExplanationCheck) => {
  if (draft.kind === "example") {
    const { example, sentence } = draft;
    const c = check as ExampleCheck;
    const rubric = rubricFor("example");
    const span = sentence.text.slice(example.spanStart, example.spanEnd);
    return {
      rubric,
      prompt: fill(rubric.template, {
        targetType: "Study Item",
        target: example.studyItemId,
        level: c.level,
        text: sentence.text,
        translation: sentence.translationEn!,
        span,
        hint: example.hint === null ? "none" : example.hint,
        answers: answerLines(draft),
        readingDisagreements: readings(c.readingDisagreements),
      }),
    };
  }
  const c = check as ExplanationCheck;
  const rubric = rubricFor("explanation");
  return {
    rubric,
    prompt: fill(rubric.template, {
      target: c.headwords.join("・"),
      level: c.level === null ? "Unlevelled" : c.level,
      meaning: c.meaning,
      text: draft.explanation.text,
      references: c.references.length ? c.references.map((r) => `- ${r}`).join("\n") : "none",
    }),
  };
};

export type Review = { judgement: Judgement; verdicts: Verdict[]; model: string; rubric: Rubric };

/** Asks the reviewer model to judge a draft that passed the automatic checks. It sees the draft and its inputs, nothing more. */
export const review = async (
  llm: Llm,
  minConfidence: number,
  draft: ExampleDraft | ExplanationDraft,
  check: ExampleCheck | ExplanationCheck,
): Promise<Review> => {
  const { rubric, prompt } = promptFor(draft, check);
  const result = await llm.review({
    system: `Judge the draft against every criterion. Rubric ${rubric.version}.`,
    prompt,
    output: ReviewerAnswer,
  });
  const verdicts: Verdict[] = result.output.verdicts.map((v) => ({ criterion: v.criterion, pass: v.pass, note: v.note }));
  return { judgement: judge(rubric.criteria, result.output, minConfidence), verdicts, model: result.model, rubric };
};
