import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@ibbun/auth";
import { createFakeAuthoring, emptyGraph } from "@ibbun/content-graph/testing";
import { createFakeJobs } from "@ibbun/jobs";
import { createFakeProgress } from "@ibbun/progress/testing";
import { LearnerId } from "@ibbun/shared";
import { createSamplingApi } from "./api.ts";
import { DEFAULT_SAMPLING } from "./config.ts";
import { createSampling } from "./sampler.ts";
import { createMemoryStore } from "./store.ts";

const setup = async () => {
  const graph = emptyGraph();
  const authoring = createFakeAuthoring(graph);
  const sessions = createFakeSessionResolver();
  const sampling = createSampling({ store: createMemoryStore(), authoring, progress: createFakeProgress(), jobs: createFakeJobs(), config: { ...DEFAULT_SAMPLING, calibration: 5 } });
  const api = createSamplingApi({ authoring, sampling, sessions });
  const as = (role: "learner" | "supervisor") => sessions.signIn({ learnerId: LearnerId.parse(randomUUID()), role });

  const provenanceId = randomUUID();
  graph.provenance.push({ id: provenanceId, source: { kind: "generated", model: "sonnet", promptTemplateVersion: "p1", generationRunId: randomUUID() }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const life = { approval: "approved" as const, retired: false, provenanceId };
  const [sentenceId, exampleId] = [randomUUID(), randomUUID()];
  graph.sentence.push({ id: sentenceId, text: "水を飲む。", translationEn: "I drink water.", tokens: [], audioKey: "audio/1.mp3", audioVoice: null, unlevelledWordCount: 0, ...life });
  graph.example.push({ id: exampleId, sentenceId, studyItemId: randomUUID(), spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life });
  const explanationId = randomUUID();
  graph.japaneseExplanation.push({ id: explanationId, wordSenseId: null, grammarPointId: randomUUID(), text: "水を口にいれる。", ...life });
  const base = { model: "opus", rubricVersion: "v1", requestId: randomUUID() };
  await sampling.admit({ kind: "example", primary: { table: "example", id: exampleId }, unit: [{ table: "example", id: exampleId }], ...base });
  await sampling.admit({ kind: "japanese-explanation", primary: { table: "japaneseExplanation", id: explanationId }, unit: [{ table: "japaneseExplanation", id: explanationId }], ...base });

  const call = (method: string, path: string, headers: Headers, body?: unknown) =>
    api.request(path, { method, headers: new Headers({ ...Object.fromEntries(headers), "content-type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body) });
  return { graph, authoring, sampling, api, as, call, exampleId, explanationId, sentenceId };
};

describe("the spot-check API", () => {
  it("is for supervisors only", async () => {
    const { api, call, as } = await setup();
    expect((await api.request("/spot-checks")).status).toBe(401);
    expect((await call("GET", "/spot-checks", as("learner"))).status).toBe(403);
    expect((await call("POST", "/re-reviews", as("learner"), { model: "opus" })).status).toBe(403);
    expect((await call("GET", "/spot-checks", as("supervisor"))).status).toBe(200);
  });

  it("lists pending samples with what to read or listen to, and the state of every kind", async () => {
    const { call, as } = await setup();
    const body = (await (await call("GET", "/spot-checks", as("supervisor"))).json()) as { kinds: Record<string, unknown>[]; samples: Record<string, unknown>[] };
    expect(body.samples).toMatchObject([
      { kind: "example", reason: "calibration", text: "水を飲む。", translation: "I drink water.", audioKey: "audio/1.mp3", model: "opus", rubricVersion: "v1" },
      { kind: "japanese-explanation", text: "水を口にいれる。" },
    ]);
    expect(body.kinds).toMatchObject([
      { kind: "example", paused: false, calibrationLeft: 4, sampled: 0, errorRate: 0 },
      { kind: "japanese-explanation", paused: false },
      { kind: "grammar-fields", paused: false },
      { kind: "listening-clip", paused: false },
    ]);
  });

  it("lists settled samples under ?status= and refuses an unknown one", async () => {
    const { call, as } = await setup();
    const supervisor = as("supervisor");
    const [first] = ((await (await call("GET", "/spot-checks", supervisor)).json()) as { samples: { id: string }[] }).samples;
    await call("POST", `/spot-checks/${first!.id}/verdict`, supervisor, { verdict: "confirm" });
    const settled = (await (await call("GET", "/spot-checks?status=confirmed", supervisor)).json()) as { samples: { id: string }[] };
    expect(settled.samples.map((s) => s.id)).toEqual([first!.id]);
    expect((await call("GET", "/spot-checks?status=nope", supervisor)).status).toBe(400);
  });

  it("takes a rejected sample down and reports the error rate", async () => {
    const { call, as, graph, exampleId } = await setup();
    const supervisor = as("supervisor");
    const [first] = ((await (await call("GET", "/spot-checks", supervisor)).json()) as { samples: { id: string }[] }).samples;
    const response = await call("POST", `/spot-checks/${first!.id}/verdict`, supervisor, { verdict: "reject", note: "wrong sense" });
    const body = (await response.json()) as { kinds: { kind: string; paused: boolean; errorRate: number }[] };
    expect(graph.example.find((e) => e.id === exampleId)!.approval).toBe("rejected");
    expect(body.kinds[0]).toMatchObject({ kind: "example", paused: true, errorRate: 1 });
  });

  it("answers 400 for a bad verdict, 404 for an unknown sample and 409 for one already settled", async () => {
    const { call, as } = await setup();
    const supervisor = as("supervisor");
    const [first] = ((await (await call("GET", "/spot-checks", supervisor)).json()) as { samples: { id: string }[] }).samples;
    expect((await call("POST", `/spot-checks/${first!.id}/verdict`, supervisor, { verdict: "maybe" })).status).toBe(400);
    expect((await call("POST", `/spot-checks/${randomUUID()}/verdict`, supervisor, { verdict: "confirm" })).status).toBe(404);
    expect((await call("POST", `/spot-checks/${first!.id}/verdict`, supervisor, { verdict: "confirm" })).status).toBe(200);
    expect((await call("POST", `/spot-checks/${first!.id}/verdict`, supervisor, { verdict: "confirm" })).status).toBe(409);
  });

  it("shows a Listening Clip by its Sentence and says so when a record is gone", async () => {
    const { call, as, sampling, sentenceId } = await setup();
    const clip = { table: "sentence" as const, id: sentenceId };
    await sampling.admit({ kind: "example", model: "opus", rubricVersion: "v2", primary: clip, unit: [clip], requestId: randomUUID() });
    const gone = { table: "sentence" as const, id: randomUUID() };
    await sampling.admit({ kind: "example", model: "opus", rubricVersion: "v2", primary: gone, unit: [gone], requestId: randomUUID() });
    const body = (await (await call("GET", "/spot-checks", as("supervisor"))).json()) as { samples: Record<string, unknown>[] };
    expect(body.samples.slice(-2)).toMatchObject([{ text: "水を飲む。", audioKey: "audio/1.mp3" }, { text: `sentence ${gone.id}` }]);
  });

  it("resumes a paused kind", async () => {
    const { call, as, sampling } = await setup();
    const supervisor = as("supervisor");
    const [first] = await sampling.samples({ status: "pending" });
    await sampling.verdict(first!.id, "reject");
    expect((await sampling.reports())[0]!.paused).toBe(true);
    const body = (await (await call("POST", "/kinds/example/resume", supervisor)).json()) as { kinds: { paused: boolean }[] };
    expect(body.kinds[0]!.paused).toBe(false);
    expect((await call("POST", "/kinds/nonsense/resume", supervisor)).status).toBe(404);
  });

  it("queues a re-review by Generation Run, rubric version or model, and wants at least one", async () => {
    const { call, as, authoring, sampling, exampleId } = await setup();
    const supervisor = as("supervisor");
    await sampling.verdict((await sampling.samples({ kind: "example" }))[0]!.id, "confirm");
    await authoring.decide({ recordTable: "example", recordId: exampleId, outcome: "approved", decider: { kind: "reviewer", model: "opus", rubricVersion: "v1" } });
    expect((await call("POST", "/re-reviews", supervisor, {})).status).toBe(400);
    expect((await call("POST", "/re-reviews", supervisor, null)).status).toBe(400);
    expect(await (await call("POST", "/re-reviews", supervisor, { rubricVersion: "v9" })).json()).toEqual({ queued: 0 });
    expect(await (await call("POST", "/re-reviews", supervisor, { model: "opus", rubricVersion: "v1" })).json()).toEqual({ queued: 1 });
  });
});
