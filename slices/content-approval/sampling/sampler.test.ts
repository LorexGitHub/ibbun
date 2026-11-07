import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring, emptyGraph } from "@mojibun/content-graph/testing";
import { ContentGenerate } from "@mojibun/content-graph/jobs";
import { createFakeJobs, handler } from "@mojibun/jobs";
import { createFakeProgress } from "@mojibun/progress/testing";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import { DEFAULT_SAMPLING, type SamplingConfig } from "./config.ts";
import { createSampling, type Approval } from "./sampler.ts";
import { createMemoryStore } from "./store.ts";

const setup = (config: Partial<SamplingConfig> = {}, random = () => 0.99) => {
  const graph = emptyGraph();
  const authoring = createFakeAuthoring(graph);
  const progress = createFakeProgress();
  const jobs = createFakeJobs();
  const generated: unknown[] = [];
  const sampling = createSampling({ store: createMemoryStore(), authoring, progress, jobs, config: { ...DEFAULT_SAMPLING, calibration: 0, ...config }, random });
  const provenance = (generationRunId: ReturnType<typeof randomUUID> = randomUUID()) => {
    const id = randomUUID();
    graph.provenance.push({ id, source: { kind: "generated", model: "sonnet", promptTemplateVersion: "p1", generationRunId }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });
    return { id, generationRunId };
  };

  /** A live Example (a Sentence and one accepted answer), approved by the reviewer. */
  const liveExample = async (over: { rubricVersion?: string; model?: string; run?: ReturnType<typeof randomUUID>; studyItemId?: string } = {}) => {
    const { id: provenanceId, generationRunId } = provenance(over.run);
    const [sentenceId, exampleId, studyItemId] = [randomUUID(), randomUUID(), over.studyItemId ?? randomUUID()];
    const life = { approval: "draft" as const, retired: false, provenanceId };
    graph.sentence.push({ id: sentenceId, text: "水を飲む。", translationEn: "I drink water.", tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life });
    graph.example.push({ id: exampleId, sentenceId, studyItemId, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life });
    const answerId = randomUUID();
    graph.exampleAnswer.push({ id: answerId, exampleId, kind: "accepted", written: "水", reading: "みず", message: null, ...life });
    const unit = [
      { table: "sentence", id: sentenceId },
      { table: "exampleAnswer", id: answerId },
      { table: "example", id: exampleId },
    ] as const;
    const decider = { kind: "reviewer" as const, model: over.model ?? "opus", rubricVersion: over.rubricVersion ?? "v1" };
    for (const { table, id } of unit) await authoring.decide({ recordTable: table, recordId: id, outcome: "approved", decider });
    return { exampleId, sentenceId, studyItemId, unit: [...unit], generationRunId, primary: { table: "example" as const, id: exampleId } };
  };

  const approval = (e: Awaited<ReturnType<typeof liveExample>>, over: Partial<Approval> = {}): Approval => ({
    kind: "example",
    model: "opus",
    rubricVersion: "v1",
    primary: e.primary,
    unit: e.unit,
    requestId: randomUUID(),
    ...over,
  });

  const meet = (exampleId: string, studyItemId: string) =>
    progress.record({ learnerId: LearnerId.parse(randomUUID()), studyItemId: StudyItemId.parse(studyItemId), kind: "srs", passed: true, at: "2026-11-07T00:00:00Z", exampleId });

  return { graph, authoring, sampling, jobs, generated, liveExample, approval, meet, provenance };
};

const open = async (s: ReturnType<typeof setup>) => s.sampling.samples({ status: "pending" });

describe("drawing samples", () => {
  it("samples every approval in the first 20 under a new version, then 5% at random", async () => {
    let roll = 0.99;
    const s = setup({ calibration: 20 }, () => roll);
    for (let i = 0; i < 20; i++) expect(await s.sampling.admit(s.approval(await s.liveExample()))).toBe("approve");
    expect((await open(s)).map((x) => x.reason)).toEqual(Array(20).fill("calibration"));

    await s.sampling.admit(s.approval(await s.liveExample()));
    expect(await open(s)).toHaveLength(20);
    roll = 0.01;
    await s.sampling.admit(s.approval(await s.liveExample()));
    expect((await open(s)).at(-1)!.reason).toBe("random");

    await s.sampling.admit(s.approval(await s.liveExample(), { rubricVersion: "v2" }));
    expect((await open(s)).at(-1)!.reason).toBe("calibration");
  });

  it("keeps a separate calibration and sample rate for each kind", async () => {
    const s = setup({ calibration: 1 });
    const e = await s.liveExample();
    await s.sampling.admit(s.approval(e));
    await s.sampling.admit(s.approval(e, { kind: "japanese-explanation", primary: { table: "japaneseExplanation", id: randomUUID() } }));
    expect((await open(s)).map((x) => x.kind)).toEqual(["example", "japanese-explanation"]);
  });

  it("records what the supervisor needs to look at: the unit, the reviewer's model and rubric", async () => {
    const s = setup({ calibration: 1 });
    const e = await s.liveExample();
    const a = s.approval(e);
    await s.sampling.admit(a);
    expect((await open(s))[0]).toMatchObject({ primary: e.primary, unit: e.unit, model: "opus", rubricVersion: "v1", requestId: a.requestId, status: "pending" });
  });
});

describe("a spot-check that rejects live content", () => {
  it("Retires an Example a Learner has met and requests a top-up for its target", async () => {
    const s = setup({ calibration: 1 });
    const e = await s.liveExample();
    await s.meet(e.exampleId, e.studyItemId);
    await s.sampling.admit(s.approval(e));
    const [sample] = await open(s);

    await s.sampling.verdict(sample!.id, "reject", "wrong sense");

    const example = s.graph.example.find((x) => x.id === e.exampleId)!;
    expect([example.approval, example.retired]).toEqual(["approved", true]);
    expect(s.graph.generationRequest.map((r) => [r.targetId, r.kind, r.reason, r.status])).toEqual([[e.studyItemId, "examples", "example retired", "open"]]);
    expect(await s.authoring.decisions(e.exampleId)).toMatchObject([{ outcome: "approved" }, { outcome: "retired", decider: { kind: "supervisor" }, reason: "wrong sense" }]);
    expect(await s.sampling.sample(sample!.id)).toMatchObject({ status: "rejected", note: "wrong sense" });
  });

  it("Rejects an Example no Learner has met, and Suspends its Study Item when none is left", async () => {
    const s = setup({ calibration: 1 });
    const e = await s.liveExample();
    await s.sampling.admit(s.approval(e));
    await s.sampling.verdict((await open(s))[0]!.id, "reject");
    const example = s.graph.example.find((x) => x.id === e.exampleId)!;
    expect([example.approval, example.retired]).toEqual(["rejected", false]);
    expect(s.graph.queueEntry.map((q) => q.reason)).toEqual(["suspended"]);
  });

  it("decides the whole unit alike, so the Sentence and answer data go with the Example", async () => {
    const s = setup({ calibration: 1 });
    const e = await s.liveExample();
    await s.sampling.admit(s.approval(e));
    await s.sampling.verdict((await open(s))[0]!.id, "reject");
    expect(s.graph.sentence.find((x) => x.id === e.sentenceId)!.approval).toBe("rejected");
    expect(s.graph.exampleAnswer[0]!.approval).toBe("rejected");
  });

  it("treats an Example met through its Sentence as met", async () => {
    const s = setup({ calibration: 1 });
    const e = await s.liveExample();
    await s.meet(e.exampleId, e.studyItemId);
    await s.sampling.admit(s.approval(e, { primary: { table: "sentence", id: e.sentenceId } }));
    await s.sampling.verdict((await open(s))[0]!.id, "reject");
    expect(s.graph.sentence.find((x) => x.id === e.sentenceId)!.retired).toBe(true);
  });

  it("Retires a Japanese Explanation once a Learner has met its Study Item, through its word sense or Grammar Point", async () => {
    const s = setup({ calibration: 3 });
    const wordId = randomUUID();
    const grammarId = randomUUID();
    const sense = randomUUID();
    const life = { approval: "approved" as const, retired: false, provenanceId: s.provenance().id };
    s.graph.wordSense.push({ id: sense, wordId, position: 0, partsOfSpeech: [], glosses: [], ...life });
    const ofWord = { id: randomUUID(), wordSenseId: sense, grammarPointId: null, text: "みず", ...life };
    const ofGrammar = { id: randomUUID(), wordSenseId: null, grammarPointId: grammarId, text: "のむ", ...life };
    const unmet = { id: randomUUID(), wordSenseId: null, grammarPointId: randomUUID(), text: "ほか", ...life };
    s.graph.japaneseExplanation.push(ofWord, ofGrammar, unmet);
    await s.meet(randomUUID(), wordId);
    await s.meet(randomUUID(), grammarId);
    for (const x of [ofWord, ofGrammar, unmet]) {
      const primary = { table: "japaneseExplanation" as const, id: x.id };
      await s.sampling.admit({ kind: "japanese-explanation", model: "opus", rubricVersion: "v1", primary, unit: [primary], requestId: randomUUID() });
    }
    for (const sample of await open(s)) await s.sampling.verdict(sample.id, "reject");
    expect(s.graph.japaneseExplanation.map((x) => [x.approval, x.retired])).toEqual([["approved", true], ["approved", true], ["rejected", false]]);
  });

  it("only settles a sample once", async () => {
    const s = setup({ calibration: 1 });
    await s.sampling.admit(s.approval(await s.liveExample()));
    const [sample] = await open(s);
    await s.sampling.verdict(sample!.id, "confirm");
    await expect(s.sampling.verdict(sample!.id, "reject")).rejects.toThrow(/already settled/);
    await expect(s.sampling.verdict(randomUUID(), "confirm")).rejects.toThrow(/no sample/);
  });
});

describe("the running error rate", () => {
  const settle = async (s: ReturnType<typeof setup>, verdicts: ("confirm" | "reject")[]) => {
    for (const verdict of verdicts) {
      await s.sampling.admit(s.approval(await s.liveExample()));
      await s.sampling.verdict((await open(s)).at(-1)!.id, verdict);
    }
  };

  it("pauses auto-approval for a kind above 10% of the last 50, and for that kind only", async () => {
    const s = setup({ calibration: 100 });
    await settle(s, [...Array(45).fill("confirm"), ...Array(5).fill("reject")]);
    expect((await s.sampling.states()).map((x) => x.paused)).toEqual([false, false, false]);
    await settle(s, ["reject"]);
    expect((await s.sampling.states()).map((x) => [x.kind, x.paused])).toEqual([["example", true], ["japanese-explanation", false], ["listening-clip", false]]);
  });

  it("does not count held drafts or re-reviews, which the supervisor chose rather than drew", async () => {
    const s = setup({ calibration: 0 });
    const e = await s.liveExample();
    await s.sampling.reReview({ model: "opus" });
    await s.sampling.verdict((await open(s))[0]!.id, "reject");
    expect((await s.sampling.states())[0]!.paused).toBe(false);
  });

  describe("while paused", () => {
    const paused = async () => {
      const s = setup({ calibration: 100, errorWindow: 5 });
      await settle(s, ["reject"]);
      return s;
    };

    it("holds the reviewer's approvals for the supervisor instead of approving them, once per draft", async () => {
      const s = await paused();
      const e = await s.liveExample();
      expect(await s.sampling.admit(s.approval(e))).toBe("hold");
      expect(await s.sampling.admit(s.approval(e))).toBe("hold");
      expect((await open(s)).filter((x) => x.reason === "held")).toHaveLength(1);
    });

    it("approves a held draft when the supervisor confirms it", async () => {
      const s = await paused();
      const draft = await s.liveExample();
      await s.sampling.admit(s.approval(draft));
      const held = (await open(s)).find((x) => x.reason === "held")!;
      await s.sampling.verdict(held.id, "confirm", "fine");
      expect(await s.authoring.decisions(draft.exampleId)).toMatchObject([{ outcome: "approved" }, { outcome: "approved", decider: { kind: "supervisor" }, reason: "fine" }]);
    });

    it("sends a held draft the supervisor rejects back to the generator as one failed attempt", async () => {
      const s = await paused();
      const request = await s.authoring.requestGeneration({ targetId: randomUUID(), kind: "examples", reason: "test" });
      await s.sampling.admit(s.approval(await s.liveExample(), { requestId: request.id }));
      await s.jobs.work([handler(ContentGenerate, async (p) => void s.generated.push(p))]);
      const held = (await open(s)).find((x) => x.reason === "held")!;
      await s.sampling.verdict(held.id, "reject", "sense is off");
      await s.jobs.drain();
      expect(s.generated).toEqual([{ requestId: request.id, feedback: "sense is off" }]);
      expect(s.graph.generationRequest.find((r) => r.id === request.id)!.attempts).toBe(1);
      expect((await s.sampling.states())[0]!.paused).toBe(true);
    });

    it("stays paused until the supervisor resumes the kind, and then starts a fresh window", async () => {
      const s = await paused();
      expect(await s.sampling.admit(s.approval(await s.liveExample()))).toBe("hold");
      await s.sampling.resume("example");
      expect(await s.sampling.states().then((x) => x[0]!.paused)).toBe(false);
      expect(await s.sampling.admit(s.approval(await s.liveExample()))).toBe("approve");
      await settle(s, ["confirm"]);
      expect((await s.sampling.states())[0]!.paused).toBe(false);
    });
  });
});

describe("re-review", () => {
  it("queues the live approvals from one Generation Run, rubric version or model, and nothing else", async () => {
    const s = setup();
    const [runA, runB] = [randomUUID(), randomUUID()];
    const a = await s.liveExample({ run: runA, rubricVersion: "v1", model: "opus" });
    const b = await s.liveExample({ run: runB, rubricVersion: "v1", model: "opus" });
    const c = await s.liveExample({ run: runB, rubricVersion: "v2", model: "haiku" });
    await s.authoring.decide({ recordTable: "example", recordId: b.exampleId, outcome: "retired", decider: { kind: "supervisor" } });
    const queued = async (filter: Parameters<typeof s.sampling.reReview>[0]) => {
      const before = (await open(s)).length;
      const count = await s.sampling.reReview(filter);
      return [count, (await open(s)).length - before];
    };

    expect(await queued({ generationRunId: runB })).toEqual([1, 1]);
    expect((await open(s))[0]).toMatchObject({ reason: "re-review", primary: c.primary, unit: c.unit, model: "haiku", rubricVersion: "v2" });
    expect(await queued({ generationRunId: runB })).toEqual([0, 0]);
    expect(await queued({ rubricVersion: "v1" })).toEqual([1, 1]);
    expect((await open(s)).at(-1)!.primary).toEqual(a.primary);
    expect(await queued({ model: "gpt" })).toEqual([0, 0]);
  });

  it("queues Japanese Explanations too, and never touches a rejection", async () => {
    const s = setup();
    const life = { approval: "approved" as const, retired: false, provenanceId: s.provenance().id };
    const explanation = { id: randomUUID(), wordSenseId: null, grammarPointId: randomUUID(), text: "のむ", ...life };
    s.graph.japaneseExplanation.push(explanation);
    const decider = { kind: "reviewer" as const, model: "opus", rubricVersion: "v1" };
    await s.authoring.decide({ recordTable: "japaneseExplanation", recordId: explanation.id, outcome: "approved", decider });
    await s.authoring.decide({ recordTable: "japaneseExplanation", recordId: randomUUID(), outcome: "rejected", decider });
    expect(await s.sampling.reReview({ model: "opus" })).toBe(1);
    expect((await open(s))[0]).toMatchObject({ kind: "japanese-explanation", reason: "re-review", unit: [{ table: "japaneseExplanation", id: explanation.id }] });
  });
});

describe("Listening Clips", () => {
  const approveClip = (s: ReturnType<typeof setup>, at: string, version = "1") =>
    s.authoring.decide({ recordTable: "sentence", recordId: randomUUID(), outcome: "approved", decider: { kind: "derived", process: "listening/voicevox", version } }).then(() => at);

  it("samples the derived approvals of clip audio by listening, each approval drawn once however often the sweep runs", async () => {
    const s = setup({ calibration: 2 });
    for (const at of ["a", "b", "c"]) await approveClip(s, at);
    await s.sampling.sweepClips();
    await s.sampling.sweepClips();
    const samples = await s.sampling.samples({ kind: "listening-clip" });
    expect(samples.map((x) => x.reason)).toEqual(["calibration", "calibration"]);
    expect(samples.every((x) => x.decisionId && x.unit.length === 1 && x.model === null)).toBe(true);
  });

  it("ignores approvals that are not derived clip audio", async () => {
    const s = setup({ calibration: 5 });
    const e = await s.liveExample();
    await s.authoring.decide({ recordTable: "sentence", recordId: randomUUID(), outcome: "approved", decider: { kind: "derived", process: "content-approval/automatic-checks", version: "1" } });
    await s.authoring.decide({ recordTable: "sentence", recordId: randomUUID(), outcome: "rejected", decider: { kind: "derived", process: "listening/voicevox", version: "1" } });
    await s.sampling.sweepClips();
    expect(await s.sampling.samples({ kind: "listening-clip" })).toEqual([]);
    expect(e).toBeDefined();
  });

  it("rejecting a sampled clip takes the record down", async () => {
    const s = setup({ calibration: 1 });
    await approveClip(s, "a");
    await s.sampling.sweepClips();
    const [sample] = await s.sampling.samples({ kind: "listening-clip" });
    await s.sampling.verdict(sample!.id, "reject", "robotic");
    expect(await s.authoring.approvalState(sample!.primary.id)).toBe("rejected");
  });
});
