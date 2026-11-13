import { z } from "zod";
import type { Authoring, GenerationRequest } from "@ibbun/content-graph/authoring";
import type { Jobs } from "@ibbun/jobs";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import type { PracticeText, Texts } from "@ibbun/progress";
import { LearnerId } from "@ibbun/shared";
import { definePlan, type Kind, type Services } from "../kind.ts";
import { factsOf, subjects, writePassageDraft, type PassageDraft } from "../passage/draft.ts";
import { reasonCodec } from "../passage/reason.ts";
import { earlierItems, levelsByItem } from "../reading-passage/earlier.ts";
import { taskTypes } from "../dialogue/config.ts";
import { dialogueShape, passageShape, type Shape } from "./plan-numbers.ts";

export const TEMPLATE_VERSION = "practice-text/1";
const KIND = "practice-text";

const Line = z.object({ text: z.string().min(1), translationEn: z.string().min(1) });

const Passage = z.object({ title: z.string().min(1), sentences: z.array(Line).min(1) });

const Question = z.object({ question: z.string().min(1), choices: z.array(z.string().min(1)).length(4), answer: z.number().int().min(0).max(3) });

const Dialogue = z.object({
  title: z.string().min(1),
  lines: z.array(Line.extend({ speaker: z.enum(["男", "女"]) })).min(2),
  questions: z.tuple([Question, Question]),
});

/** The Practice Text a request is for; its choices are on the record `reading` or `listening` wrote. */
const PracticeContext = z.object({ learnerId: LearnerId, practiceTextId: z.uuid() });
type PracticeContext = z.output<typeof PracticeContext>;
const { reasonOf, contextOf } = reasonCodec(`${KIND} `, PracticeContext);

const SYSTEM = `You write Japanese practice texts for a JLPT learner who has cleared a level. Use only vocabulary and grammar at or below the stated JLPT level, apart from the items you are asked to use. Give every line an accurate English translation. Answer only in the requested JSON shape.`;

const findText = async (texts: Texts, { learnerId, practiceTextId }: PracticeContext): Promise<PracticeText | undefined> =>
  (await texts.practiceTexts(learnerId)).find((t) => t.id === practiceTextId);

type Form = {
  shape: (text: PracticeText) => Shape;
  ask: (text: PracticeText, shape: Shape) => string[];
  output: z.ZodType;
  draft: (output: never) => PassageDraft;
};

const FORMS: Record<PracticeText["form"], Form> = {
  passage: {
    shape: (t) => passageShape(t.level, t.length, t.passageType),
    ask: (t, { size, type }) => [`Write ${type} of about ${size} characters, at JLPT level ${t.level} or easier.`],
    output: Passage,
    draft: ({ title, sentences }: z.output<typeof Passage>) => ({
      title,
      form: "prose",
      comprehensionQuestions: [],
      sentences: sentences.map((s) => ({ ...s, speaker: null })),
    }),
  },
  dialogue: {
    shape: (t) => dialogueShape(t.level, t.length, t.passageType),
    ask: (t, { size, type }) => [
      `Write a dialogue of about ${size} lines between 男 and 女, at JLPT level ${t.level} or easier, for a ${type} task.`,
      "Use natural spoken register and a clear speaker turn on every line.",
      `Add two comprehension questions of two different task types out of ${taskTypes(t.level).join(", ")}.`,
      "Each question is in Japanese with four choices, one correct, and can only be answered from the dialogue.",
    ],
    output: Dialogue,
    draft: ({ title, lines, questions }: z.output<typeof Dialogue>) => ({ title, form: "dialogue", comprehensionQuestions: questions, sentences: lines }),
  },
};

/** The Learner's weakest Known items of the level, weakest first (listening.md#content-rules). */
const weakestKnown = async (auth: Authoring, { progress }: Services, text: PracticeText, count: number) => {
  const [met, levels] = await Promise.all([progress.items(text.learnerId), levelsByItem(auth)]);
  const known = met.filter((p) => p.known);
  return subjects(auth, earlierItems(known, levels, text.level, [], count));
};

const plan = async (auth: Authoring, request: GenerationRequest, feedback: string | undefined, services: Services) => {
  const context = contextOf(request.reason);
  const text = context && (await findText(services.texts, context));
  if (!text) return null;

  const form = FORMS[text.form];
  const shape = form.shape(text);
  const weakest = await weakestKnown(auth, services, text, shape.weakest);
  const prompt = [
    ...form.ask(text, shape),
    ...(text.topic ? [`Topic: ${text.topic}`] : []),
    ...(weakest.length ? ["Use at least half of these items, which the Learner knows least well:", ...factsOf(weakest)] : []),
    ...(feedback ? [`The previous attempt was rejected: ${feedback}`] : []),
  ].join("\n");

  return definePlan({
    templateVersion: TEMPLATE_VERSION,
    system: SYSTEM,
    prompt,
    output: form.output,
    inputs: factsOf(weakest),
    write: (output, run) => writePassageDraft(auth, request.targetId, run, weakest.flatMap((s) => s.recordIds), form.draft(output as never)),
  });
};

/** A Practice Text's Reading Passage, prose or dialogue (listening.md#practice-texts), requested by `practice.generate`. */
export const practiceText: Kind = { name: KIND, plan };

/**
 * Opens the Generation Request for a recorded Practice Text and starts its first attempt. Does nothing for a
 * Practice Text the Learner has no record of, or one that already has a request.
 */
export const requestPracticeText = async ({ auth, jobs, texts }: { auth: Authoring; jobs: Jobs; texts: Texts }, context: PracticeContext) => {
  const text = await findText(texts, context);
  if (!text || (await auth.rows("generationRequest", { targetId: text.passageId, kind: KIND })).length) return;
  const request = await auth.requestGeneration({ targetId: text.passageId, kind: KIND, reason: reasonOf(context) });
  await jobs.enqueue(ContentGenerate, { requestId: request.id });
};
