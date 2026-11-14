import { Hono } from "hono";
import type { AuthEnv } from "@ibbun/auth";
import type { ContentGraph } from "@ibbun/content-graph";
import { PracticeGenerate } from "@ibbun/content-graph/jobs";
import type { Jobs } from "@ibbun/jobs";
import { isLevelCleared, type Progress, type Texts } from "@ibbun/progress";
import { isShowcase, JLPT_LEVELS, LearnerId, type JlptLevel } from "@ibbun/shared";
import { textView, type Reader } from "../../server/text.ts";
import { PracticeRequest, type Library, type PracticeOptions, type PracticeResult } from "../contract.ts";

export type PracticeConfig = {
  /** Practice Texts per Learner in any rolling 24 h (listening.md#limits). */
  dailyLimit: number;
  /** How long a request waits for its text before it goes to the library. */
  waitMs: number;
  pollMs: number;
};

export const DEFAULT_PRACTICE: PracticeConfig = { dailyLimit: 5, waitMs: 20_000, pollMs: 1_000 };

/** What Practice Texts need beyond the reading slice's own core modules. */
export type PracticeRuntime = {
  jobs: Pick<Jobs, "enqueue">;
  newId: () => string;
  sleep: (ms: number) => Promise<void>;
  config: PracticeConfig;
};

export type PracticeDeps = PracticeRuntime & {
  contentGraph: ContentGraph;
  progress: Progress;
  texts: Texts;
  now: () => Date;
  readerFor: (learnerId: LearnerId) => Promise<Reader>;
};

const notFound = { message: "no such text" };

/** Practice Texts of Reading Passages (listening.md#practice-texts): generated on a Cleared Level, private to their Learner. */
export const createPracticeApi = ({ contentGraph, progress, texts, jobs, now, newId, sleep, config, readerFor }: PracticeDeps) => {
  const clearedLevels = async (learnerId: LearnerId): Promise<JlptLevel[]> => {
    const [path, known] = await Promise.all([contentGraph.pathItems(), progress.known(learnerId)]);
    return JLPT_LEVELS.filter((level) =>
      isLevelCleared(path.filter((i) => i.type === "kanji" && i.level === level && !i.suspended).map((i) => i.id), known),
    );
  };

  const used = (learnerId: LearnerId) => texts.countLast24h(learnerId, "practice", now());

  /** Polls until the approved passage exists or the wait is over. */
  const awaitPassage = async (passageId: string): Promise<boolean> => {
    for (let waited = 0; ; waited += config.pollMs) {
      if (await contentGraph.readingPassage(passageId)) return true;
      if (waited + config.pollMs > config.waitMs) return false;
      await sleep(config.pollMs);
    }
  };

  return new Hono<AuthEnv>()
    .get("/options", async (c) => {
      const learnerId = LearnerId.parse(c.get("learner").learnerId);
      const body: PracticeOptions = {
        clearedLevels: await clearedLevels(learnerId),
        remaining: Math.max(0, config.dailyLimit - (await used(learnerId))),
      };
      return c.json(body);
    })

    .post("/texts", async (c) => {
      const request = PracticeRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a practice request" }, 400);
      if (isShowcase(process.env.SHOWCASE)) return c.json({ status: "showcase" } satisfies PracticeResult);
      const learnerId = LearnerId.parse(c.get("learner").learnerId);
      if (!(await clearedLevels(learnerId)).includes(request.data.level)) return c.json({ message: "level not cleared" }, 403);
      if ((await used(learnerId)) >= config.dailyLimit) return c.json({ status: "limit" } satisfies PracticeResult);

      const { level, passageType, length, topic } = request.data;
      const passageId = newId();
      const text = await texts.record({ kind: "practice", learnerId, passageId, at: now().toISOString(), level, form: "passage", passageType, length, ...(topic && { topic }) });
      await jobs.enqueue(PracticeGenerate, { learnerId, practiceTextId: text.id, level, kind: "passage" });
      const body: PracticeResult = (await awaitPassage(passageId)) ? { status: "ready", id: text.id } : { status: "waiting" };
      return c.json(body);
    })

    .get("/texts", async (c) => {
      const mine = (await texts.practiceTexts(LearnerId.parse(c.get("learner").learnerId))).filter((t) => t.form === "passage");
      const entries = await Promise.all(
        mine.map(async ({ id, level, passageType, length, topic, at, passageId }) => ({
          id, level, passageType, length, topic: topic ?? null, at, title: (await contentGraph.readingPassage(passageId))?.title ?? null,
        })),
      );
      const body: Library = { texts: entries.sort((a, b) => b.at.localeCompare(a.at)) };
      return c.json(body);
    })

    .get("/texts/:id", async (c) => {
      const learnerId = LearnerId.parse(c.get("learner").learnerId);
      const text = (await texts.practiceTexts(learnerId)).find((t) => t.id === c.req.param("id") && t.form === "passage");
      const passage = text && (await contentGraph.readingPassage(text.passageId));
      if (!passage) return c.json(notFound, 404);
      return c.json(textView(passage, await readerFor(learnerId), null));
    });
};
