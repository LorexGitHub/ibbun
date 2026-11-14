import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Authoring, GenerationRequest, GenerationRun } from "@ibbun/content-graph/authoring";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import { currentLevel } from "@ibbun/content-graph/levels";
import type { Jobs } from "@ibbun/jobs";
import type { JlptLevel } from "@ibbun/shared";
import { definePlan, type Kind } from "../kind.ts";
import { subjectOf, type Subject } from "../example-sentence/subject.ts";
import { describeTaskType, LINES, taskTypes, VOICES } from "./config.ts";

export const TEMPLATE_VERSION = "dialogue/1";
const KIND = "dialogue";

const Speaker = z.enum(["男", "女"]);
const Question = z.object({ question: z.string().min(1), correct: z.string().min(1), distractors: z.array(z.string().min(1)).length(3) });

export const Dialogue = z.object({
  lines: z.array(z.object({ speaker: Speaker, text: z.string().min(1), translationEn: z.string().min(1) })).min(2),
  questions: z.tuple([Question, Question]),
});
type Dialogue = z.output<typeof Dialogue>;

const SYSTEM = `You write short Japanese listening dialogues for JLPT learners, in the style of the JLPT 聴解 scripts: two unnamed speakers, 男 and 女, in natural spoken Japanese. Use only vocabulary and grammar at or below the stated JLPT level, apart from the Grammar Point you are asked to use. Make every line a clear turn by one speaker, and give it an accurate English translation. Write the comprehension questions and options in Japanese text, answerable only from what is said. Answer only in the requested JSON shape.`;

const hashOf = (text: string) => createHash("sha256").update(text).digest().readUInt32BE(0);

/** Two different task types; each new dialogue takes the next pair, so the dialogues spread over every pair. */
const questionTypes = async (auth: Authoring, level: JlptLevel, clipId: string) => {
  const types = taskTypes(level);
  const earlier = (await auth.rows("listeningClip", { kind: "dialogue" })).filter((c) => c.studyItemId !== clipId).length;
  const first = earlier % types.length;
  return [types[first]!, types[(first + 1) % types.length]!];
};

const voicesOf = (clipId: string) => {
  const h = hashOf(clipId);
  return { 男: VOICES.男[h % VOICES.男.length]!, 女: VOICES.女[h % VOICES.女.length]! };
};

const levelOf = async (auth: Authoring, studyItemId: string) => currentLevel(await auth.rows("levelCandidate", { studyItemId }));

/**
 * The clip's Study Item takes the Generation Request's id, so every attempt of the request
 * rewrites the same clip and the rejected attempt's lines and questions are retired.
 */
const write = async (auth: Authoring, request: GenerationRequest, subject: Subject, { lines, questions }: Dialogue, run: GenerationRun) => {
  const clipId = request.id;
  const provenanceId = randomUUID();
  await auth.insert("provenance", [
    {
      id: provenanceId,
      source: { kind: "generated", model: run.model, promptTemplateVersion: run.promptTemplateVersion, generationRunId: run.id },
      licence: "ibbun",
      author: null,
      sourceUrl: null,
      inputs: subject.recordIds,
    },
  ]);
  const life = { approval: "draft", retired: false, provenanceId } as const;
  const [existing] = await auth.rows("studyItem", { id: clipId });
  if (existing) {
    await auth.update("studyItem", { id: clipId }, life);
    await auth.update("clipVoicesSentence", { clipId }, { retired: true });
    await auth.update("example", { studyItemId: clipId }, { retired: true });
  } else {
    await auth.insert("studyItem", [{ id: clipId, type: "listening_clip", ...life }]);
    await auth.insert("listeningClip", [{ studyItemId: clipId, kind: "dialogue" }]);
  }
  const voices = voicesOf(clipId);
  const sentenceIds: string[] = [];
  for (const [position, line] of lines.entries()) {
    const sentenceId = randomUUID();
    sentenceIds.push(sentenceId);
    await auth.insert("sentence", [
      { id: sentenceId, text: line.text, translationEn: line.translationEn, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life },
    ]);
    await auth.insert("clipVoicesSentence", [
      { id: randomUUID(), clipId, sentenceId, position, speaker: line.speaker, voice: voices[line.speaker], audioKey: null, ...life },
    ]);
  }
  // A question is about the whole dialogue; its Example points at the opening line.
  const opening = { sentenceId: sentenceIds[0]!, spanStart: 0, spanEnd: lines[0]!.text.length };
  await auth.insert(
    "example",
    questions.map((q) => ({
      id: randomUUID(),
      studyItemId: clipId,
      ...opening,
      targetSenseId: null,
      hint: null,
      comprehensionQuestion: { question: q.question, choices: [q.correct, ...q.distractors], answer: 0 },
      ...life,
    })),
  );
};

/** A JLPT-style dialogue with two comprehension questions for one levelled Grammar Point (listening.md#dialogues). */
export const dialogue: Kind = {
  name: KIND,
  async plan(auth, request, feedback) {
    const subject = await subjectOf(auth, request.targetId);
    const level = await levelOf(auth, request.targetId);
    if (subject?.type !== "grammar_point" || !level) return null;
    const types = await questionTypes(auth, level, request.id);
    return definePlan({
      templateVersion: TEMPLATE_VERSION,
      system: SYSTEM,
      prompt: [
        `Write a dialogue of about ${LINES[level]} lines between 男 and 女, at JLPT level ${level} or easier, that uses this Grammar Point:`,
        ...subject.facts,
        "Then write two comprehension questions, each with one correct option and three distractors, one of each task type:",
        ...types.map(describeTaskType),
        ...(feedback ? [`The previous attempt was rejected: ${feedback}`] : []),
      ].join("\n"),
      output: Dialogue,
      inputs: subject.facts,
      write: (output, run) => write(auth, request, subject, output, run),
    });
  },
};

/** Opens and starts a dialogue request for every levelled Grammar Point that has never had one. Returns how many. */
export const requestDialogues = async (auth: Authoring, jobs: Jobs): Promise<number> => {
  const asked = new Set((await auth.rows("generationRequest", { kind: KIND })).map((r) => r.targetId));
  const points = await auth.rows("studyItem", { type: "grammar_point", approval: "approved", retired: false });
  let opened = 0;
  for (const { id } of points) {
    if (asked.has(id) || !(await levelOf(auth, id))) continue;
    const request = await auth.requestGeneration({ targetId: id, kind: KIND, reason: "levelled grammar point" });
    await jobs.enqueue(ContentGenerate, { requestId: request.id });
    opened++;
  }
  return opened;
};
