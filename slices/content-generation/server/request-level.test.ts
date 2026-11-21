import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring } from "@ibbun/content-graph/testing";
import { createFakeJobs } from "@ibbun/jobs";
import type { JlptLevel, LearnerId, StudyItemId } from "@ibbun/shared";
import { contextOf, reasonOf } from "../kinds/reading-passage/context.ts";
import { optionsOf, requestLevel } from "./request-level.ts";
import { world } from "./world.ts";

const learnerId = randomUUID() as LearnerId;

const setup = () => {
  const w = world();
  const auth = createFakeAuthoring(w.graph, { now: () => new Date("2026-11-21T09:00:00Z"), newId: randomUUID });
  const jobs = createFakeJobs();
  const life = (approval: "draft" | "approved" | "rejected") => ({ approval, retired: false, provenanceId: w.life.provenanceId });

  /** A seeded Grammar Point: Draft, with a Draft List candidate. */
  const addGrammar = (level: JlptLevel, approval: "draft" | "approved" = "draft") => {
    const id = randomUUID();
    w.graph.studyItem.push({ id, type: "grammar_point", ...life(approval) });
    w.graph.grammarPoint.push({ studyItemId: id, title: id, forms: [], formation: [], register: "neutral", meaning: "", notes: null, matcherRule: null });
    w.graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level, kind: "list", ...life(approval) });
    return id;
  };
  const addWord = (level: JlptLevel) => {
    const id = randomUUID();
    w.graph.studyItem.push({ id, type: "word", ...w.life });
    w.graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level, kind: "list", ...w.life });
    return id;
  };
  const addExample = (studyItemId: string, approval: "draft" | "rejected") =>
    w.graph.example.push({
      id: randomUUID(), studyItemId, sentenceId: randomUUID(), spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life(approval),
    });
  const addExplanation = (grammarPointId: string, approval: "draft" | "rejected") =>
    w.graph.japaneseExplanation.push({ id: randomUUID(), wordSenseId: null, grammarPointId, text: "説明", ...life(approval) });

  const targets = async (kind: string) => (await auth.rows("generationRequest", { kind })).map((r) => r.targetId).sort();
  return { ...w, auth, jobs, addGrammar, addWord, addExample, addExplanation, targets };
};

describe("requestLevel", () => {
  it("opens grammar-fields for every Draft Grammar Point at the level, whose level is only a Draft candidate", async () => {
    const t = setup();
    const draft = t.addGrammar("N5");
    t.addGrammar("N4");

    const counts = await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5" });

    expect(counts["grammar-fields"]).toBe(1);
    expect(await t.targets("grammar-fields")).toEqual([draft]);
  });

  it("opens examples and explanation only for approved Grammar Points at the level that lack them", async () => {
    const t = setup();
    const bare = t.addGrammar("N5", "approved");
    const rejectedOnly = t.addGrammar("N5", "approved");
    t.addExample(rejectedOnly, "rejected");
    t.addExplanation(rejectedOnly, "rejected");
    const covered = t.addGrammar("N5", "approved");
    t.addExample(covered, "draft");
    t.addExplanation(covered, "draft");
    t.addGrammar("N5");
    t.addGrammar("N4", "approved");

    const counts = await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5" });

    const expected = [t.grammarId, bare, rejectedOnly].sort();
    expect(await t.targets("examples")).toEqual(expected);
    expect(await t.targets("explanation")).toEqual(expected);
    expect(counts).toMatchObject({ examples: 3, explanation: 3 });
  });

  it("works on only the first --points Grammar Points at the level by id, the same set at every stage and on every run", async () => {
    const t = setup();
    const n5 = [t.grammarId, t.addGrammar("N5", "approved"), t.addGrammar("N5"), t.addGrammar("N5"), t.addGrammar("N5", "approved")];
    t.addGrammar("N4");
    const chosen = [...n5].sort().slice(0, 3);
    const approved = new Set((await t.auth.rows("studyItem", { type: "grammar_point", approval: "approved" })).map((r) => r.id));

    await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", points: 3 });
    await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", points: 3 });

    expect(await t.targets("grammar-fields")).toEqual(chosen.filter((id) => !approved.has(id)));
    expect(await t.targets("examples")).toEqual(chosen.filter((id) => approved.has(id)));
    expect(await t.targets("explanation")).toEqual(chosen.filter((id) => approved.has(id)));
  });

  it("opens dialogues for approved levelled Grammar Points at the level, up to the cap, counting earlier ones", async () => {
    const t = setup();
    const points = [t.addGrammar("N5", "approved"), t.addGrammar("N5", "approved"), t.addGrammar("N5", "approved")];
    t.addGrammar("N4", "approved");

    expect((await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", clips: 2 })).dialogue).toBe(2);
    expect((await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", clips: 3 })).dialogue).toBe(1);
    expect((await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", clips: 10 })).dialogue).toBe(1);

    expect(await t.targets("dialogue")).toEqual([t.grammarId, ...points].sort());
  });

  it("opens Batch Texts for the Learner at the level from approved Words, ten per batch, up to the cap", async () => {
    const t = setup();
    const words = Array.from({ length: 34 }, () => t.addWord("N5"));
    t.addWord("N4");

    const first = await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", learnerId, texts: 2 });
    const second = await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", learnerId, texts: 10 });

    expect([first["batch-text"], second["batch-text"]]).toEqual([2, 2]);
    const batches = (await t.auth.rows("generationRequest", { kind: "batch-text" })).map((r) => contextOf(r.reason)!);
    expect(batches.map((b) => b.itemIds.length)).toEqual([10, 10, 10, 5]);
    expect(batches.every((b) => b.learnerId === learnerId && b.level === "N5")).toBe(true);
    expect(batches.flatMap((b) => b.itemIds).sort()).toEqual([t.wordId, ...words].sort());
  });

  it("counts toward the Batch Text cap only the Learner's own requests at the level", async () => {
    const t = setup();
    Array.from({ length: 30 }, () => t.addWord("N5"));
    const other = randomUUID() as LearnerId;
    for (const context of [{ learnerId: other, level: "N5" as const }, { learnerId, level: "N4" as const }])
      await t.auth.requestGeneration({ targetId: randomUUID(), kind: "batch-text", reason: reasonOf({ ...context, itemIds: [t.wordId as StudyItemId] }) });
    await t.auth.requestGeneration({ targetId: randomUUID(), kind: "batch-text", reason: "by hand" });
    for (let i = 0; i < 2; i++)
      await t.auth.requestGeneration({ targetId: randomUUID(), kind: "batch-text", reason: reasonOf({ learnerId, level: "N5", itemIds: [t.wordId as StudyItemId] }) });

    expect((await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", learnerId, texts: 4 }))["batch-text"]).toBe(2);
  });

  it("opens no Batch Texts without a Learner", async () => {
    const t = setup();
    expect((await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5" }))["batch-text"]).toBe(0);
    expect(await t.targets("batch-text")).toEqual([]);
  });

  it("opens nothing on a rerun, and enqueues content.generate once per request opened", async () => {
    const t = setup();
    t.addGrammar("N5");
    t.addGrammar("N5", "approved");
    t.addWord("N5");

    const first = await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", learnerId });
    const opened = Object.values(first).reduce((a, b) => a + b, 0);
    const again = await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N5", learnerId });

    expect(opened).toBe((await t.auth.rows("generationRequest")).length);
    expect(Object.values(again).every((n) => n === 0)).toBe(true);
    expect(t.jobs.pending()).toEqual(Array(opened).fill("content.generate"));
  });

  it("opens nothing for another level", async () => {
    const t = setup();
    const n4 = t.addGrammar("N4", "approved");
    t.addGrammar("N4");

    await requestLevel({ auth: t.auth, jobs: t.jobs }, { level: "N4", learnerId });

    const requests = await t.auth.rows("generationRequest");
    expect(requests.filter((r) => r.kind !== "grammar-fields").every((r) => r.targetId === n4)).toBe(true);
    expect(requests.some((r) => r.targetId === t.grammarId || r.targetId === t.wordId)).toBe(false);
  });
});

describe("optionsOf", () => {
  it("reads the level, the Learner and the counts from the command line", () => {
    expect(optionsOf({ level: "N4", learner: learnerId, points: "20", clips: "3", texts: "7" })).toEqual({ level: "N4", learnerId, points: 20, clips: 3, texts: 7 });
  });

  it("leaves out what was not given, and refuses a missing level", () => {
    expect(optionsOf({ level: "N5" })).toEqual({ level: "N5", learnerId: undefined, points: undefined, clips: undefined, texts: undefined });
    expect(() => optionsOf({})).toThrow();
  });
});
