import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { z } from "zod";
import type { AuthEnv, createAuthGuards } from "@mojibun/auth";
import { grade, normalise, type ComprehensionQuestion, type ContentGraph } from "@mojibun/content-graph";
import { PracticeGenerate } from "@mojibun/content-graph/jobs";
import type { Jobs } from "@mojibun/jobs";
import type { Learners } from "@mojibun/learner";
import { isLevelCleared, type PracticeText, type Progress, type Texts } from "@mojibun/progress";
import { JLPT_LEVELS, LearnerId, StudyItemId, type JlptLevel } from "@mojibun/shared";
import { AnswerRequest, type AnswerResponse, type ClipView } from "../../contract.ts";
import { audioUrl, shuffled } from "../../server/clip.ts";
import { GenerateRequest, type LibraryEntry, type Options } from "../practice-contract.ts";

export type PracticeDeps = {
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  texts: Texts;
  jobs: Jobs;
  guards: ReturnType<typeof createAuthGuards>;
  now: () => Date;
  /** [0, 1), for shuffling a question's options. */
  random: () => number;
  /** Practice Texts per Learner in a rolling 24 h (accounts.md, config). */
  practiceLimit: number;
};

type AnswerBody = z.output<typeof AnswerRequest>;

type Dialogue = { passageId: StudyItemId; lines: { speaker: "男" | "女" | null; text: string; translation: string | null; audio: string }[]; questions: ComprehensionQuestion[] };

const notFound = { message: "no such Practice Text" };
const tooMany = { message: "You have used today's Practice Texts. Try again tomorrow." };

/** A dialogue the Learner can play: approved, with a voice on every line and its questions. Otherwise it is still being made. */
const dialogueOf = async (contentGraph: ContentGraph, text: PracticeText): Promise<Dialogue | null> => {
  const passage = await contentGraph.readingPassage(text.passageId);
  if (passage?.form !== "dialogue" || passage.questions.length === 0 || passage.sentences.some((s) => !s.audio)) return null;
  const lines = passage.sentences.map((s) => ({ speaker: s.speaker, text: s.text, translation: s.translationEn, audio: audioUrl(s.audio!.key) }));
  return { passageId: StudyItemId.parse(passage.id), lines, questions: passage.questions };
};

/**
 * Practice Text dialogues (listening.md#practice-texts): a Learner at a Cleared Level generates a dialogue, hears it and
 * answers its 2 questions. Answers are graded here and logged as `cram`, so a Practice Text never moves the schedule.
 */
export const createPracticeApi = ({ contentGraph, progress, learners, texts, jobs, guards, now, random, practiceLimit }: PracticeDeps) => {
  const dialogues = async (learnerId: LearnerId) => (await texts.practiceTexts(learnerId)).filter((t) => t.form === "dialogue");
  const remainingFor = async (learnerId: LearnerId) =>
    Math.max(0, practiceLimit - (await texts.countLast24h(learnerId, "practice", now())));

  const clearedLevels = async (learnerId: LearnerId): Promise<JlptLevel[]> => {
    const [items, known] = await Promise.all([contentGraph.pathItems(), progress.known(learnerId)]);
    const kanjiOf = (level: JlptLevel) => items.filter((i) => i.type === "kanji" && i.level === level && !i.suspended).map((i) => i.id);
    return JLPT_LEVELS.filter((level) => isLevelCleared(kanjiOf(level), known));
  };

  /** A graded answer, logged as `cram`; the Study Item is the passage and the Example is `<passageId>:<question>`. */
  const logAnswer = async (learnerId: LearnerId, passageId: StudyItemId, answer: AnswerBody, outcome: "pass" | "fail") => {
    const { examMode } = await learners.preferences(learnerId);
    await progress.record({
      learnerId,
      studyItemId: passageId,
      kind: "cram",
      passed: outcome === "pass",
      at: now().toISOString(),
      exampleId: `${passageId}:${answer.exampleId}`,
      facets: [{ facet: "comprehension", rawInput: answer.input, normalisedInput: normalise(answer.input), outcome }],
      attempts: answer.attempts.map((attempt) => ({ facet: "comprehension", input: attempt })),
      revealed: answer.revealed,
      timeToAnswerMs: answer.timeToAnswerMs,
      listening: { replays: examMode ? 0 : answer.replays, slow: !examMode && answer.slow, examMode },
    });
  };

  const learnerOf = (c: { get: (key: "learner") => { learnerId: string } }) => LearnerId.parse(c.get("learner").learnerId);

  return new Hono<AuthEnv>()
    .use(guards.requireLearner())

    .get("/options", async (c) => {
      const learnerId = learnerOf(c);
      const body: Options = { cleared: await clearedLevels(learnerId), remaining: await remainingFor(learnerId) };
      return c.json(body);
    })

    .get("/", async (c) => {
      const library: LibraryEntry[] = await Promise.all(
        (await dialogues(learnerOf(c))).map(async (text) => {
          const { id, level, passageType, length, topic, at } = text;
          return { id, level, passageType, length, at, ...(topic && { topic }), ready: (await dialogueOf(contentGraph, text)) !== null };
        }),
      );
      return c.json(library);
    })

    .post("/", async (c) => {
      const request = GenerateRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not one of the choices" }, 400);
      const learnerId = learnerOf(c);
      if (!(await clearedLevels(learnerId)).includes(request.data.level)) return c.json({ message: `${request.data.level} is not cleared yet` }, 403);
      if ((await remainingFor(learnerId)) === 0) return c.json(tooMany, 429);

      const { level, passageType, length, topic } = request.data;
      const text = await texts.record({ kind: "practice", learnerId, passageId: randomUUID(), at: now().toISOString(), level, form: "dialogue", passageType, length, topic });
      await jobs.enqueue(PracticeGenerate, { learnerId, practiceTextId: text.id, level, kind: "dialogue" });
      return c.json({ id: text.id }, 202);
    })

    .get("/:id", async (c) => {
      const learnerId = learnerOf(c);
      const text = (await dialogues(learnerId)).find((t) => t.id === c.req.param("id"));
      if (!text) return c.json(notFound, 404);
      const dialogue = await dialogueOf(contentGraph, text);
      if (!dialogue) return c.json({ status: "pending" }, 202);

      const [prefs, answered] = await Promise.all([learners.preferences(learnerId), progress.log(learnerId, dialogue.passageId)]);
      const index = answered.length % dialogue.questions.length;
      const question = dialogue.questions[index]!;
      const view: ClipView = {
        clipId: text.id,
        exampleId: String(index),
        audio: dialogue.lines.map((l) => ({ src: l.audio, speaker: l.speaker })),
        question: { prompt: question.question, choices: shuffled(question.choices, random) },
        examMode: prefs.examMode,
        slowAudio: prefs.slowAudio,
      };
      return c.json(view);
    })

    .post("/:id/answer", async (c) => {
      const body = AnswerRequest.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ message: "not an answer" }, 400);
      const learnerId = learnerOf(c);
      const text = (await dialogues(learnerId)).find((t) => t.id === c.req.param("id"));
      const dialogue = text && (await dialogueOf(contentGraph, text));
      const question = dialogue && dialogue.questions[Number(body.data.exampleId)];
      if (!dialogue || !question) return c.json(notFound, 404);

      const { input, revealed } = body.data;
      const graded = grade({ facet: "comprehension", answer: question.answer, choiceCount: question.choices.length }, question.choices.indexOf(input));
      const outcome = revealed ? "fail" : graded.outcome;
      if (outcome === "retry") return c.json({ outcome } satisfies AnswerResponse);

      await logAnswer(learnerId, dialogue.passageId, body.data, outcome);
      const response: AnswerResponse = {
        outcome,
        transcript: dialogue.lines.map(({ speaker, text, translation, audio }) => ({ speaker, text, translation, audio })),
        correctChoice: question.choices[question.answer]!,
      };
      return c.json(response);
    });
};
