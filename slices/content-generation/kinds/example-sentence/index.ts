import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Authoring, GenerationRun } from "@ibbun/content-graph/authoring";
import { definePlan, type Kind } from "../kind.ts";
import { subjectOf } from "./subject.ts";

export const TEMPLATE_VERSION = "example-sentence/1";
/** A Grammar Point is topped up to this many approved Examples (grammar-points.md). */
const GRAMMAR_POINT_TARGET = 5;
/** A Word or Kanji with none is Suspended; a few give the reviewer a choice. */
const OTHER_TARGET = 3;

const Sentence = z
  .object({
    text: z.string().min(1),
    translationEn: z.string().min(1),
    /** The part of `text` the Learner practises, exactly as it is written there. */
    target: z.string().min(1),
    /** Kana reading of `target`, kept as its accepted answer. */
    targetReading: z.string().min(1),
    hint: z.string().nullable(),
  })
  .refine((s) => s.text.split(s.target).length === 2, { error: "target must appear in text exactly once" });

export const ExampleSentences = z.object({ sentences: z.array(Sentence).min(1).max(GRAMMAR_POINT_TARGET) });
type ExampleSentences = z.output<typeof ExampleSentences>;

const SYSTEM = `You write natural Japanese example sentences for JLPT learners. Use only vocabulary and grammar at or below the stated JLPT level. Each sentence uses the target exactly once and has an accurate English translation. Answer only in the requested JSON shape.`;

const howMany = async (auth: Authoring, studyItemId: string, type: string): Promise<number> => {
  if (type !== "grammar_point") return OTHER_TARGET;
  const have = await auth.rows("example", { studyItemId, approval: "approved", retired: false });
  return Math.max(1, GRAMMAR_POINT_TARGET - have.length);
};

const write = async (auth: Authoring, studyItemId: string, inputRecordIds: string[], { sentences }: ExampleSentences, run: GenerationRun) => {
  const provenanceId = randomUUID();
  await auth.insert("provenance", [
    {
      id: provenanceId,
      source: { kind: "generated", model: run.model, promptTemplateVersion: run.promptTemplateVersion, generationRunId: run.id },
      licence: "ibbun",
      author: null,
      sourceUrl: null,
      inputs: inputRecordIds,
    },
  ]);
  const life = { approval: "draft", retired: false, provenanceId } as const;
  for (const s of sentences) {
    const sentenceId = randomUUID();
    const exampleId = randomUUID();
    const spanStart = s.text.indexOf(s.target);
    await auth.insert("sentence", [
      { id: sentenceId, text: s.text, translationEn: s.translationEn, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life },
    ]);
    await auth.insert("example", [
      { id: exampleId, sentenceId, studyItemId, spanStart, spanEnd: spanStart + s.target.length, targetSenseId: null, hint: s.hint, comprehensionQuestion: null, ...life },
    ]);
    await auth.insert("exampleAnswer", [
      { id: randomUUID(), exampleId, kind: "accepted", written: s.target, reading: s.targetReading, message: null, ...life },
    ]);
  }
};

/** Example Sentences for a Word, a levelled Kanji or a Grammar Point (content-approval.md#what-is-generated). */
export const exampleSentence: Kind = {
  name: "examples",
  async plan(auth, request, feedback) {
    const subject = await subjectOf(auth, request.targetId);
    if (!subject) return null;
    const count = await howMany(auth, request.targetId, subject.type);
    return definePlan({
      templateVersion: TEMPLATE_VERSION,
      system: SYSTEM,
      prompt: [
        `Write ${count} Example Sentences at JLPT level ${subject.level} or easier.`,
        ...subject.facts,
        ...(feedback ? [`The previous attempt was rejected: ${feedback}`] : []),
      ].join("\n"),
      output: ExampleSentences,
      inputs: subject.facts,
      write: (output, run) => write(auth, request.targetId, subject.recordIds, output, run),
    });
  },
};
