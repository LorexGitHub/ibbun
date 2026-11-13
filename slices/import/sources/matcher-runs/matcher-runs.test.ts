import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Authoring } from "@ibbun/content-graph/authoring";
import { createFakeAuthoring, emptyGraph, type Graph } from "@ibbun/content-graph/testing";
import { createFakeJobs, type FakeJobs } from "@ibbun/jobs";
import { EXAMPLES_PER_GRAMMAR_POINT, matcherRunsJob, MatcherRuns, runMatchers } from "./index.ts";

const RULE = { pattern: [{ lemma: "食べる" }] };

type Lifecycle = { approval: "draft" | "approved" | "rejected"; retired: boolean; provenanceId: string };

const build = () => {
  const graph = emptyGraph();
  const provenanceId = randomUUID();
  graph.provenance.push({ id: provenanceId, source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const life: Lifecycle = { approval: "approved", retired: false, provenanceId };
  const point = (rule: unknown = RULE, lifecycle: Partial<Lifecycle> = {}) => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "grammar_point", ...life, ...lifecycle });
    graph.grammarPoint.push({ studyItemId: id, title: "t", forms: [], formation: [], register: "neutral", meaning: "m", notes: null, matcherRule: rule });
    return id;
  };
  const sentence = (lemmas: string[], lifecycle: Partial<Lifecycle> = {}) => {
    const id = randomUUID();
    let at = 0;
    const tokens = lemmas.map((lemma) => ({ surface: lemma, lemma, reading: "", partOfSpeech: [], conjugationForm: null, start: at, end: (at += lemma.length) }));
    graph.sentence.push({ id, text: lemmas.join(""), translationEn: null, tokens, audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life, ...lifecycle });
    return id;
  };
  const example = (studyItemId: string, sentenceId: string, lifecycle: Partial<Lifecycle> = {}) =>
    graph.example.push({ id: randomUUID(), sentenceId, studyItemId, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life, ...lifecycle });
  return { graph, point, sentence, example, life };
};

let w: ReturnType<typeof build>;
let authoring: Authoring;
let jobs: FakeJobs;
beforeEach(() => {
  w = build();
  authoring = createFakeAuthoring(w.graph);
  jobs = createFakeJobs();
});

const run = () => runMatchers({ authoring, jobs });
const links = () => authoring.rows("sentenceDemonstratesGrammar");

describe("runMatchers", () => {
  it("proposes a draft demonstrates link, with a derived Provenance, for each place an approved rule matches an approved Sentence", async () => {
    const point = w.point();
    const hit = w.sentence(["私", "は", "食べる"]);
    w.sentence(["私", "は", "飲む"]);
    expect(await run()).toEqual({ proposed: 1, requested: 1 });
    const [link, ...rest] = await links();
    expect(rest).toEqual([]);
    expect(link).toMatchObject({ sentenceId: hit, grammarPointId: point, spanStart: 2, spanEnd: 5, approval: "draft", retired: false });
    expect(w.graph.provenance.find((p) => p.id === link!.provenanceId)!.source).toMatchObject({ kind: "derived", process: "matcher-run" });
  });

  it("skips Grammar Points that are unapproved, retired or have no rule, and Sentences that are unapproved or retired", async () => {
    w.point(RULE, { approval: "draft" });
    w.point(RULE, { retired: true });
    w.point(null);
    w.sentence(["食べる"], { approval: "draft" });
    w.sentence(["食べる"], { retired: true });
    w.point();
    expect((await run()).proposed).toBe(0);
  });

  it("proposes nothing new on a rerun", async () => {
    w.point();
    w.sentence(["食べる"]);
    await run();
    expect((await run()).proposed).toBe(0);
    expect(await links()).toHaveLength(1);
  });

  it.each(["approved", "rejected"] as const)("keeps a %s decision and proposes no second link for the same span", async (approval) => {
    const point = w.point();
    const sentence = w.sentence(["食べる"]);
    await run();
    const [link] = await links();
    await authoring.update("sentenceDemonstratesGrammar", { id: link!.id }, { approval });
    expect((await run()).proposed).toBe(0);
    expect(await links()).toEqual([{ ...link, approval }]);
    expect(link).toMatchObject({ sentenceId: sentence, grammarPointId: point });
  });

  it("does not propose a retired link's span again", async () => {
    w.point();
    w.sentence(["食べる"]);
    await run();
    const [link] = await links();
    await authoring.update("sentenceDemonstratesGrammar", { id: link!.id }, { retired: true });
    expect((await run()).proposed).toBe(0);
  });

  it("proposes a new span on a Sentence whose other span was decided", async () => {
    w.point();
    const sentence = w.sentence(["食べる"]);
    await run();
    w.graph.sentence.find((x) => x.id === sentence)!.tokens.push({ surface: "食べる", lemma: "食べる", reading: "", partOfSpeech: [], conjugationForm: null, start: 3, end: 6 });
    expect((await run()).proposed).toBe(1);
    expect(await links()).toHaveLength(2);
  });

  describe("top-up Generation Requests", () => {
    const requests = () => authoring.rows("generationRequest");

    it("opens a request and queues content.generate for a Grammar Point under the target of approved Examples", async () => {
      const point = w.point();
      const sentence = w.sentence(["飲む"]);
      for (let i = 0; i < EXAMPLES_PER_GRAMMAR_POINT - 1; i++) w.example(point, sentence);
      w.example(point, sentence, { retired: true });
      w.example(point, sentence, { approval: "draft" });
      expect(await run()).toMatchObject({ requested: 1 });
      const [request, ...rest] = await requests();
      expect(rest).toEqual([]);
      expect(request).toMatchObject({ targetId: point, kind: "examples", status: "open" });
      expect(jobs.pending()).toEqual(["content.generate"]);
    });

    it("opens none for a Grammar Point with enough approved Examples", async () => {
      const point = w.point();
      const sentence = w.sentence(["飲む"]);
      for (let i = 0; i < EXAMPLES_PER_GRAMMAR_POINT; i++) w.example(point, sentence);
      expect((await run()).requested).toBe(0);
      expect(await requests()).toEqual([]);
    });

    it("does not open a second request or queue a second job on a rerun", async () => {
      w.point();
      await run();
      expect((await run()).requested).toBe(0);
      expect(await requests()).toHaveLength(1);
      expect(jobs.pending()).toEqual(["content.generate"]);
    });

    it("opens none for an unapproved Grammar Point", async () => {
      w.point(RULE, { approval: "draft" });
      expect((await run()).requested).toBe(0);
    });
  });
});

describe("the job", () => {
  it("runs from its handler", async () => {
    w.point();
    w.sentence(["食べる"]);
    await jobs.work([matcherRunsJob(() => ({ authoring, jobs }))]);
    await jobs.enqueue(MatcherRuns, {});
    await jobs.drain();
    expect(await links()).toHaveLength(1);
  });
});
