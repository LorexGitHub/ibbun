import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Authoring, GenerationRun } from "@mojibun/content-graph/authoring";
import { definePlan, type Kind } from "../kind.ts";
import { subjectOf } from "../example-sentence/subject.ts";

export const TEMPLATE_VERSION = "answer-data/1";
const MOST = 5;

const SYSTEM = `You write answer data for a Japanese fill-in-the-blank exercise for JLPT learners. Alternates are correct Japanese that is not the target: each gets a short nudge telling the Learner what is wanted instead. Known wrong answers are mistakes learners really make: each gets a short explanation of why it fails here. The hint is an English gloss of just the target. Use only vocabulary and grammar at or below the stated JLPT level. Answer only in the requested JSON shape.`;

/** The answer shape, refusing an alternate or known wrong answer that repeats an accepted one. */
const outputFor = (accepted: ReadonlySet<string>) => {
  const form = { written: z.string().min(1), reading: z.string().min(1).nullable() };
  const fresh = { error: "repeats an accepted answer" };
  const isNew = (a: { written: string; reading: string | null }) => !accepted.has(a.written) && !(a.reading && accepted.has(a.reading));
  return z.object({
    alternates: z.array(z.object({ ...form, nudge: z.string().min(1) }).refine(isNew, fresh)).max(MOST),
    knownWrong: z.array(z.object({ ...form, explanation: z.string().min(1) }).refine(isNew, fresh)).max(MOST),
    hint: z.string().min(1).nullable(),
  });
};
type AnswerData = z.output<ReturnType<typeof outputFor>>;

const write = async (auth: Authoring, exampleId: string, inputRecordIds: string[], output: AnswerData, run: GenerationRun) => {
  const provenanceId = randomUUID();
  await auth.insert("provenance", [
    {
      id: provenanceId,
      source: { kind: "generated", model: run.model, promptTemplateVersion: run.promptTemplateVersion, generationRunId: run.id },
      licence: "mojibun",
      author: null,
      sourceUrl: null,
      inputs: inputRecordIds,
    },
  ]);
  const answer = (kind: "alternate" | "known_wrong", a: { written: string; reading: string | null }, message: string) =>
    ({ id: randomUUID(), exampleId, kind, written: a.written, reading: a.reading, message, approval: "draft", retired: false, provenanceId }) as const;
  await auth.insert("exampleAnswer", [
    ...output.alternates.map((a) => answer("alternate", a, a.nudge)),
    ...output.knownWrong.map((a) => answer("known_wrong", a, a.explanation)),
  ]);
  if (output.hint) await auth.update("example", { id: exampleId, hint: null }, { hint: output.hint });
};

/**
 * Alternates with nudges, Known Wrong Answers with explanations and a hint for a drafted Example, Tatoeba ones included
 * (review-answer-model.md#answer-data). The request targets the Example, which must still be a Draft: it is reviewed
 * with its answer data as one unit (content-approval.md#units-of-approval).
 */
export const answerData: Kind = {
  name: "answer_data",
  async plan(auth, request, feedback) {
    const [example] = await auth.rows("example", { id: request.targetId, approval: "draft", retired: false });
    if (!example) return null;
    const [[sentence], accepted, subject] = await Promise.all([
      auth.rows("sentence", { id: example.sentenceId }),
      auth.rows("exampleAnswer", { exampleId: example.id, kind: "accepted" }),
      subjectOf(auth, example.studyItemId),
    ]);
    if (!sentence || !accepted.length || !subject) return null;
    const inputs = [
      `Sentence: ${sentence.text}`,
      `Translation: ${sentence.translationEn}`,
      `Target: ${sentence.text.slice(example.spanStart, example.spanEnd)}`,
      ...accepted.map((a) => `Accepted: ${a.written}${a.reading ? ` (${a.reading})` : ""}`),
      ...(example.hint ? [`Existing hint: ${example.hint}`] : []),
    ];
    return definePlan({
      templateVersion: TEMPLATE_VERSION,
      system: SYSTEM,
      prompt: [
        `Write answer data for this Example at JLPT level ${subject.level} or easier: at most ${MOST} alternates and ${MOST} known wrong answers, fewer or none if few fit.`,
        ...inputs,
        ...subject.facts,
        ...(feedback ? [`The previous attempt was rejected: ${feedback}`] : []),
      ].join("\n"),
      output: outputFor(new Set(accepted.flatMap((a) => [a.written, ...(a.reading ? [a.reading] : [])]))),
      inputs,
      write: (output, run) => write(auth, example.id, [example.id, sentence.id, ...subject.recordIds], output, run),
    });
  },
};
