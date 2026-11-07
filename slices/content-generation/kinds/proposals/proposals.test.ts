import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, type Graph } from "@mojibun/content-graph/testing";
import { ContentGenerate } from "@mojibun/content-graph/jobs";
import { createFakeJobs } from "@mojibun/jobs";
import { createFakeProgress, createFakeTexts } from "@mojibun/progress/testing";
import { createFakeLlm, loadLlmConfig } from "@mojibun/llm";
import { contentGeneration } from "../../server/generate.ts";
import { world } from "../../server/world.ts";

const clock = () => {
  let t = Date.parse("2026-11-07T09:00:00Z");
  return { now: () => new Date((t += 1000)), newId: randomUUID };
};

/** A draft Grammar Point imported from `dataset`. */
const importedPoint = (graph: Graph, life: { provenanceId: string }, dataset: string, title: string, meaning: string, level: "N5" | "N4" | null) => {
  const id = randomUUID();
  const draft = { approval: "draft" as const, retired: false, provenanceId: life.provenanceId };
  graph.studyItem.push({ id, type: "grammar_point", ...draft });
  graph.grammarPoint.push({ studyItemId: id, title, forms: [{ text: title, register: "polite" }], formation: [], register: "polite", meaning, notes: null, matcherRule: null });
  graph.sourceKey.push({ dataset, upstreamKey: title, recordId: id });
  if (level) graph.levelCandidate.push({ id: randomUUID(), studyItemId: id, level, kind: "list", ...draft });
  return id;
};

/** A draft ja Wiktionary gloss attached to `senseId`. */
const wiktionaryGloss = (graph: Graph, life: { provenanceId: string }, senseId: string, text: string) => {
  const id = randomUUID();
  graph.japaneseExplanation.push({ id, wordSenseId: senseId, grammarPointId: null, text, approval: "draft", retired: false, provenanceId: life.provenanceId });
  graph.sourceKey.push({ dataset: "wiktionary-ja", upstreamKey: text, recordId: id });
  return id;
};

const setup = (answer: (prompt: string) => unknown) => {
  const w = world();
  const c = clock();
  const auth = createFakeAuthoring(w.graph, c);
  const jobs = createFakeJobs();
  const llm = createFakeLlm({ config: loadLlmConfig({}), answer: ({ prompt }) => answer(prompt) });
  const generation = contentGeneration({ auth, llm, jobs, progress: createFakeProgress(), texts: createFakeTexts(), config: { dailyTokenBudget: 1_000_000, batchTextShare: 0.5 }, now: c.now });
  const ready = jobs.work(generation.handlers);
  const run = async (targetId: string, kind: string) => {
    await ready;
    const request = await auth.requestGeneration({ targetId, kind, reason: "seed" });
    await jobs.enqueue(ContentGenerate, { requestId: request.id });
    await jobs.drain();
    return request;
  };
  return { ...w, auth, jobs, run };
};

describe("merge_proposal", () => {
  const grammar = () => {
    let ids: { hanabira: string; tte: string; tai: string };
    const t = setup(() => ({ match: 2, confidence: "high", reason: "same pattern" }));
    ids = {
      hanabira: importedPoint(t.graph, t.life, "hanabira", "〜たい", "want to do", null),
      tte: importedPoint(t.graph, t.life, "tanos", "〜って", "quoting", "N4"),
      tai: importedPoint(t.graph, t.life, "tanos", "〜たい", "want to do", "N5"),
    };
    return { t, ...ids };
  };

  it("queues the Tanos entry the model picked, with its reason and the Generation Run", async () => {
    const { t, hanabira, tai } = grammar();
    // The Tanos dataset also keys Kanji; only its Grammar Points are candidates.
    t.graph.sourceKey.push({ dataset: "tanos", upstreamKey: "食", recordId: t.kanjiId });
    const request = await t.run(hanabira, "merge_proposal");

    const [run] = await t.auth.rows("generationRun", { requestId: request.id });
    expect(run!.promptTemplateVersion).toBe("merge-proposal/1");
    expect(JSON.stringify(run!.inputs)).toContain("want to do");
    expect(JSON.stringify(run!.inputs)).toContain("N4");
    expect(run!.inputs).toHaveLength(3);

    const entries = await t.auth.queue({ reason: "merge proposal" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      recordId: hanabira,
      generationRunId: run!.id,
      generationRequestId: request.id,
      detail: { hanabiraId: hanabira, tanosId: tai, confidence: "high", reason: "same pattern" },
    });
    expect((await t.auth.rows("generationRequest", { id: request.id }))[0]!.status).toBe("in review");
  });

  it("proposes no merge when the model finds no match", async () => {
    const t = setup(() => ({ match: null, confidence: "medium", reason: "different meaning" }));
    const hanabira = importedPoint(t.graph, t.life, "hanabira", "ように", "like", null);
    importedPoint(t.graph, t.life, "tanos", "ように", "so that", "N4");
    await t.run(hanabira, "merge_proposal");
    expect((await t.auth.queue({ reason: "merge proposal" }))[0]!.detail).toMatchObject({ hanabiraId: hanabira, tanosId: null });
  });

  it("retries with the rejection as feedback and uses an attempt when the model answers out of range", async () => {
    const prompts: string[] = [];
    const t = setup((prompt) => {
      prompts.push(prompt);
      return prompts.length === 1 ? { match: 9, confidence: "high", reason: "x" } : { match: 1, confidence: "low", reason: "ok" };
    });
    const hanabira = importedPoint(t.graph, t.life, "hanabira", "〜たい", "want to do", null);
    importedPoint(t.graph, t.life, "tanos", "〜たい", "want to do", "N5");
    const request = await t.run(hanabira, "merge_proposal");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("The previous attempt was rejected");
    expect((await t.auth.rows("generationRequest", { id: request.id }))[0]!.attempts).toBe(1);
    expect(await t.auth.queue({ reason: "merge proposal" })).toHaveLength(1);
  });

  it.each([
    ["a target that is not a hanabira point", (t: ReturnType<typeof grammar>["t"]) => t.grammarId],
    ["a target that is gone", () => randomUUID()],
  ])("fails an attempt for %s and queues nothing", async (_, target) => {
    const { t } = grammar();
    const request = await t.run(target(t), "merge_proposal");
    expect((await t.auth.rows("generationRequest", { id: request.id }))[0]!.attempts).toBe(3);
    expect(await t.auth.queue({ reason: "merge proposal" })).toEqual([]);
  });

  it("fails an attempt when there is no Tanos entry to match", async () => {
    const t = setup(() => ({ match: 1, confidence: "high", reason: "x" }));
    const hanabira = importedPoint(t.graph, t.life, "hanabira", "〜たい", "want to do", null);
    const request = await t.run(hanabira, "merge_proposal");
    expect((await t.auth.rows("generationRequest", { id: request.id }))[0]!.status).toBe("failed");
  });
});

describe("sense_alignment", () => {
  const word = (answer: (prompt: string) => unknown = () => ({ alignments: [] })) => {
    const t = setup(answer);
    const second = randomUUID();
    t.graph.wordSense.push({ id: second, wordId: t.wordId, position: 1, partsOfSpeech: ["v1"], glosses: ["to live on"], approval: "approved", retired: false, provenanceId: t.life.provenanceId });
    return { t, second };
  };

  it("queues, for each Wiktionary gloss, the JMdict sense the model picked", async () => {
    const { t, second } = word(() => ({
      alignments: [
        { gloss: 1, sense: 1, confidence: "high", reason: "eating" },
        { gloss: 2, sense: 2, confidence: "medium", reason: "making a living" },
      ],
    }));
    const eat = wiktionaryGloss(t.graph, t.life, t.senseId, "食物を口に入れてのみこむ。");
    const live = wiktionaryGloss(t.graph, t.life, t.senseId, "暮らしを立てる。");
    const auth = t.auth;
    const request = await t.run(t.wordId, "sense_alignment");

    const [run] = await auth.rows("generationRun", { requestId: request.id });
    expect(run!.promptTemplateVersion).toBe("sense-alignment/1");
    const entries = await auth.queue({ reason: "sense alignment" });
    const detail = (id: string) => entries.find((e) => e.recordId === id)!.detail;
    expect(entries).toHaveLength(2);
    expect(detail(eat)).toMatchObject({ explanationId: eat, currentSenseId: t.senseId, proposedSenseId: t.senseId, confidence: "high" });
    expect(detail(live)).toMatchObject({ currentSenseId: t.senseId, proposedSenseId: second, reason: "making a living" });
    expect(entries.every((e) => e.generationRunId === run!.id)).toBe(true);
  });

  it("proposes no sense for a gloss the model cannot place, and ignores glosses that are not draft ja Wiktionary", async () => {
    const t = setup(() => ({ alignments: [{ gloss: 1, sense: null, confidence: "low", reason: "archaic sense" }] }));
    const archaic = wiktionaryGloss(t.graph, t.life, t.senseId, "（古）食らう。");
    t.graph.japaneseExplanation.push({ id: randomUUID(), wordSenseId: t.senseId, grammarPointId: null, text: "別の出典", approval: "draft", retired: false, provenanceId: t.life.provenanceId });
    wiktionaryGloss(t.graph, t.life, randomUUID(), "別の語の説明。");
    await t.run(t.wordId, "sense_alignment");
    const entries = await t.auth.queue({ reason: "sense alignment" });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.detail).toMatchObject({ explanationId: archaic, proposedSenseId: null });
  });

  it("rejects an answer that skips a gloss", async () => {
    const t = setup(() => ({ alignments: [{ gloss: 1, sense: 1, confidence: "high", reason: "x" }] }));
    wiktionaryGloss(t.graph, t.life, t.senseId, "one");
    wiktionaryGloss(t.graph, t.life, t.senseId, "two");
    const request = await t.run(t.wordId, "sense_alignment");
    expect((await t.auth.rows("generationRequest", { id: request.id }))[0]!.status).toBe("failed");
    expect(await t.auth.queue({ reason: "sense alignment" })).toEqual([]);
  });

  it.each([
    ["a Word with no Wiktionary glosses", (t: ReturnType<typeof setup>) => t.wordId],
    ["a target that is not a Word", (t: ReturnType<typeof setup>) => t.grammarId],
  ])("fails an attempt for %s", async (_, target) => {
    const t = setup(() => ({ alignments: [] }));
    const request = await t.run(target(t), "sense_alignment");
    expect((await t.auth.rows("generationRequest", { id: request.id }))[0]!.status).toBe("failed");
  });
});
