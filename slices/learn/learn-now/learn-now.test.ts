import { describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@mojibun/auth";
import { createFakeContentGraph, n5Fixture } from "@mojibun/content-graph/testing";
import { createFakeLearners } from "@mojibun/learner/testing";
import { createFakeLearningPath } from "@mojibun/learning-path/testing";
import { createFakeJobs } from "@mojibun/jobs";
import { createFakeProgress, createFakeTexts } from "@mojibun/progress/testing";
import { StudyItemId, type LearnerId } from "@mojibun/shared";
import type { Batch, CompleteRequest, QuizPrompt } from "../contract.ts";
import { createLearnApi } from "../server/learn-api.ts";

/** The N5 fixture has no Listening Clip, so every item has a lesson and a question. */
type TaughtBatch = Omit<Batch, "items"> & { items: Extract<Batch["items"][number], { lesson: unknown }>[] };

const NOW = new Date("2026-11-06T09:00:00.000Z");

const setup = async () => {
  const fixture = n5Fixture();
  const sessions = createFakeSessionResolver();
  const learners = createFakeLearners();
  const progress = createFakeProgress();
  const contentGraph = createFakeContentGraph(fixture.graph);
  const learningPath = createFakeLearningPath({ contentGraph, progress });
  const learner = await learners.add({ email: "a@example.com" });
  const headers = sessions.signIn({ learnerId: learner.id, role: "learner" });
  const api = createLearnApi({ sessions, learners, progress, contentGraph, learningPath, jobs: createFakeJobs(), texts: createFakeTexts(), now: () => NOW });
  const send = (method: string, path: string, body?: unknown) =>
    api.request(path, {
      method,
      headers: new Headers([...headers, ["content-type", "application/json"]]),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const get = async <T>(path: string) => (await api.request(path, { headers })).json() as Promise<T>;
  return { learner: learner.id as LearnerId, learners, learningPath, progress, send, get, api, headers };
};

const answerFor = (facet: QuizPrompt["facets"][number]) => {
  if (facet.answerData.facet === "meaning") return facet.answerData.meanings[0]!.text;
  const accepted = facet.answerData.accepted[0]!;
  return accepted.reading ?? accepted.written;
};
const correct = (prompt: QuizPrompt): CompleteRequest["answers"][number] => ({
  studyItemId: prompt.studyItemId,
  exampleId: prompt.exampleId,
  facets: prompt.facets.map((f) => ({ facet: f.facet, input: answerFor(f), attempts: [] })),
});

/** A Study Item that is locked: the Learning Path would not offer it first. */
const lockedItem = async (t: Awaited<ReturnType<typeof setup>>) => {
  const [first] = await t.learningPath.next(t.learner, 1);
  const pending = (await t.get<TaughtBatch>("/batch")).items.map((i) => i.lesson.studyItemId);
  const all = await Promise.all(pending.map(async (id) => ((await t.learningPath.isLocked(t.learner, id)) ? id : null)));
  return all.find((id) => id !== null && id !== first) ?? null;
};

describe("Learn now", () => {
  it("teaches any item with its dependencies pulled in, as forItem() says", async () => {
    const t = await setup();
    const wordId = (await t.get<TaughtBatch>("/batch")).items.find((i) => i.lesson.type === "word")!.lesson.studyItemId;
    const expected = await t.learningPath.forItem(t.learner, wordId);
    const batch = await t.get<TaughtBatch>(`/now/${wordId}`);
    expect(batch.items.map((i) => i.lesson.studyItemId)).toEqual(expected);
    expect(batch.items.map((i) => i.lesson.studyItemId)).toContain(wordId);
    expect(batch.items[0]).toHaveProperty("prompt");
  });

  it("offers a locked item too", async () => {
    const t = await setup();
    const id = await lockedItem(t);
    expect(id).not.toBeNull();
    const batch = await t.get<TaughtBatch>(`/now/${id}`);
    expect(batch.items.map((i) => i.lesson.studyItemId)).toContain(id);
  });

  it("refuses an item that does not exist, and an id that is not one", async () => {
    const t = await setup();
    const missing = StudyItemId.parse("00000000-0000-4000-8000-000000000999");
    expect((await t.send("GET", `/now/${missing}`)).status).toBe(404);
    expect((await t.send("GET", "/now/nope")).status).toBe(400);
    expect((await t.api.request("/now/x")).status).toBe(401);
  });

  it("counts a passed item as introduced, so its Track skips it", async () => {
    const t = await setup();
    const id = await lockedItem(t);
    const batch = await t.get<TaughtBatch>(`/now/${id}`);
    await t.send("POST", "/complete", { now: true, answers: batch.items.map((i) => correct(i.prompt)) });
    expect(await t.progress.item(t.learner, id!)).toMatchObject({ introduced: true });
    const offered = (await t.get<TaughtBatch>("/batch")).items.map((i) => i.lesson.studyItemId);
    expect(offered).not.toContain(id);
  });

  it("records I know this as introduced", async () => {
    const t = await setup();
    const id = await lockedItem(t);
    expect((await t.send("POST", "/skip", { studyItemId: id, now: true })).status).toBe(200);
    expect(await t.progress.item(t.learner, id!)).toMatchObject({ known: true, introduced: true });
  });
});
