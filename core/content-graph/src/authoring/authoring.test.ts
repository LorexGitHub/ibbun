import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import { emptyGraph, type Graph } from "../graph.ts";
import type { Approval } from "../schema.ts";
import { createFakeAuthoring, migrateContentGraph, seedContentGraph } from "../testing.ts";
import { createAuthoring, MAX_ATTEMPTS, type Authoring, type Clock } from "./index.ts";
import { memoryStore, postgresStore, type Store } from "./store.ts";

const supervisor = { kind: "supervisor" } as const;
const reviewer = { kind: "reviewer", model: "opus", rubricVersion: "r1" } as const;

/** A clock that ticks one second per read, so "latest" never ties. */
const tickingClock = (): Clock => {
  let t = Date.parse("2026-11-06T00:00:00Z");
  return { now: () => new Date((t += 1000)), newId: randomUUID };
};

/** One Word with a Sentence and the given Examples, on fresh IDs. */
const world = (...examples: Approval[]) => {
  const graph = emptyGraph();
  const provenanceId = randomUUID();
  const life = (approval: Approval = "approved") => ({ approval, retired: false, provenanceId });
  graph.provenance.push({ id: provenanceId, source: { kind: "authored", by: "test" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });
  const item = randomUUID();
  graph.studyItem.push({ id: item, type: "word", ...life() });
  graph.word.push({ studyItemId: item, priorityTags: [] });
  const sentence = randomUUID();
  graph.sentence.push({ id: sentence, text: "パンを食べる。", translationEn: null, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life() });
  const exampleIds = examples.map((approval) => {
    const id = randomUUID();
    graph.example.push({ id, sentenceId: sentence, studyItemId: item, spanStart: 3, spanEnd: 6, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life(approval) });
    return id;
  });
  const importRun = randomUUID();
  graph.importRun.push({ id: importRun, dataset: "jmdict", upstreamVersion: "1", checksum: "x", status: "applied", counts: {}, appliedAt: null });
  return { graph, item, sentence, examples: exampleIds, importRun };
};

type Harness = { authoring: Authoring; seed: (graph: Graph) => Promise<void> };

const contract = (make: () => Promise<Harness>) => {
  let h: Harness;
  beforeAll(async () => {
    h = await make();
  });
  const given = async (...examples: Approval[]) => {
    const w = world(...examples);
    await h.seed(w.graph);
    return { ...w, a: h.authoring };
  };

  describe("writes and reads that include drafts", () => {
    it("reads draft and approved rows alike, and writes updates", async () => {
      const { a, item, examples } = await given("approved", "draft");
      expect((await a.rows("example", { studyItemId: item })).map((e) => e.id).sort()).toEqual([...examples].sort());
      await a.update("example", { id: examples[1]! }, { hint: "eat" });
      expect((await a.rows("example", { id: examples[1]! }))[0]).toMatchObject({ hint: "eat", approval: "draft" });
    });

    it("inserts new records", async () => {
      const { a, sentence } = await given();
      const id = randomUUID();
      const [provenance] = await a.rows("sentence", { id: sentence });
      await a.insert("sentence", [{ ...provenance!, id, text: "水を飲む。", approval: "draft" }]);
      expect((await a.rows("sentence", { id }))[0]?.text).toBe("水を飲む。");
    });
  });

  describe("derived links", () => {
    const link = (item: string, provenanceId: string) => ({ id: randomUUID(), retiredWordId: item, wordId: item, approval: "approved" as const, retired: false, provenanceId });

    it("hard-deletes derived links by id and leaves the rest", async () => {
      const w = world();
      const derived = randomUUID();
      w.graph.provenance.push({ id: derived, source: { kind: "derived", process: "p", version: "1" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });
      const [gone, kept] = [link(w.item, derived), link(w.item, derived)];
      w.graph.wordSupersededBy.push(gone, kept);
      await h.seed(w.graph);
      await h.authoring.removeDerivedLinks("wordSupersededBy", [gone.id]);
      expect((await h.authoring.rows("wordSupersededBy", { provenanceId: derived })).map((r) => r.id)).toEqual([kept.id]);
    });

    it("refuses to delete a link that is not derived, and deletes nothing", async () => {
      const w = world();
      const derived = randomUUID();
      w.graph.provenance.push({ id: derived, source: { kind: "derived", process: "p", version: "1" }, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });
      const [fine, authored] = [link(w.item, derived), link(w.item, w.graph.provenance[0]!.id)];
      w.graph.wordSupersededBy.push(fine, authored);
      await h.seed(w.graph);
      await expect(h.authoring.removeDerivedLinks("wordSupersededBy", [fine.id, authored.id])).rejects.toThrow(/not a derived link/);
      expect(await h.authoring.rows("wordSupersededBy", { id: fine.id })).toHaveLength(1);
    });

    it("refuses a table that holds no derived links", async () => {
      await expect(h.authoring.removeDerivedLinks("example" as never, [])).rejects.toThrow(/not a derived link table/);
    });
  });

  describe("Approval Decisions", () => {
    it("appends every decision and takes the latest as the record's state", async () => {
      const { a, examples } = await given("draft", "approved");
      const ex = examples[0]!;
      expect(await a.approvalState(ex)).toBeNull();
      await a.decide({ recordTable: "example", recordId: ex, outcome: "rejected", decider: reviewer, reason: "unnatural", verdicts: [{ criterion: "natural", pass: false }] });
      await a.decide({ recordTable: "example", recordId: ex, outcome: "approved", decider: supervisor });
      expect((await a.decisions(ex)).map((d) => d.outcome)).toEqual(["rejected", "approved"]);
      expect((await a.decisions(ex))[0]).toMatchObject({ reason: "unnatural", decider: reviewer, verdicts: [{ criterion: "natural", pass: false }] });
      expect(await a.approvalState(ex)).toBe("approved");
      expect((await a.rows("example", { id: ex }))[0]?.approval).toBe("approved");
    });

    it("keeps an escalated record a draft and queues it as escalated", async () => {
      const { a, examples } = await given("draft");
      await a.decide({ recordTable: "example", recordId: examples[0]!, outcome: "escalated", decider: reviewer });
      expect((await a.rows("example", { id: examples[0]! }))[0]?.approval).toBe("draft");
      expect((await a.queue({ reason: "escalated" })).map((e) => e.recordId)).toContain(examples[0]);
    });

    it("retires a record without changing its approval", async () => {
      const { a, sentence } = await given();
      await a.decide({ recordTable: "sentence", recordId: sentence, outcome: "retired", decider: supervisor });
      expect((await a.rows("sentence", { id: sentence }))[0]).toMatchObject({ approval: "approved", retired: true });
      expect(await a.approvalState(sentence)).toBe("retired");
    });
  });

  describe("Suspended Study Items", () => {
    it("suspends a Study Item whose last approved Example is retired, once, with one Generation Request", async () => {
      const { a, item, examples } = await given("approved", "approved");
      await a.decide({ recordTable: "example", recordId: examples[0]!, outcome: "retired", decider: supervisor });
      expect(await a.isSuspended(item)).toBe(false);
      expect((await a.rows("generationRequest", { targetId: item })).map((r) => r.reason)).toEqual(["example retired"]);

      await a.decide({ recordTable: "example", recordId: examples[1]!, outcome: "retired", decider: supervisor });
      expect(await a.isSuspended(item)).toBe(true);
      expect(await a.rows("generationRequest", { targetId: item })).toHaveLength(1);
      expect((await a.queue({ reason: "suspended" })).filter((e) => e.recordId === item)).toHaveLength(1);
      expect(await a.checkSuspension(item)).toBe(true);
      expect((await a.queue({ reason: "suspended" })).filter((e) => e.recordId === item)).toHaveLength(1);
    });

    it("comes back once an Example is approved", async () => {
      const { a, item, examples } = await given("draft");
      expect(await a.checkSuspension(item)).toBe(true);
      expect((await a.rows("generationRequest", { targetId: item }))[0]).toMatchObject({ kind: "examples", reason: "suspended", status: "open" });
      await a.decide({ recordTable: "example", recordId: examples[0]!, outcome: "approved", decider: reviewer });
      expect(await a.isSuspended(item)).toBe(false);
      expect(await a.checkSuspension(item)).toBe(false);
    });
  });

  describe("Generation Requests and Runs", () => {
    it("is idempotent per target and kind while one is open or in review", async () => {
      const { a, item } = await given("approved");
      const first = await a.requestGeneration({ targetId: item, kind: "japanese_explanation", reason: "missing" });
      expect(await a.requestGeneration({ targetId: item, kind: "japanese_explanation", reason: "again" })).toEqual(first);
      await a.setGenerationStatus(first.id, "in review");
      expect((await a.requestGeneration({ targetId: item, kind: "japanese_explanation", reason: "again" })).id).toBe(first.id);
      expect((await a.requestGeneration({ targetId: item, kind: "answer_data", reason: "missing" })).id).not.toBe(first.id);
      await a.setGenerationStatus(first.id, "done");
      expect((await a.requestGeneration({ targetId: item, kind: "japanese_explanation", reason: "again" })).id).not.toBe(first.id);
    });

    it("fails after the last attempt and queues it as generation failed", async () => {
      const { a, item } = await given("approved");
      const request = await a.requestGeneration({ targetId: item, kind: "examples", reason: "manual" });
      for (let i = 1; i < MAX_ATTEMPTS; i++) expect(await a.failAttempt(request.id)).toMatchObject({ attempts: i, status: "open" });
      expect(await a.failAttempt(request.id)).toMatchObject({ attempts: MAX_ATTEMPTS, status: "failed" });
      expect((await a.queue({ reason: "generation failed" })).map((e) => e.generationRequestId)).toContain(request.id);
      await expect(a.failAttempt(randomUUID())).rejects.toThrow(/no Generation Request/);
    });

    it("records a Generation Run", async () => {
      const { a, item } = await given("approved");
      const request = await a.requestGeneration({ targetId: item, kind: "examples", reason: "manual" });
      const run = await a.recordGenerationRun({ requestId: request.id, model: "sonnet", promptTemplateVersion: "p1", inputs: [item, "gloss"], tokens: 1200, cost: 0.004 });
      expect((await a.rows("generationRun", { id: run.id }))[0]).toEqual(run);
    });
  });

  describe("the Content Approval queue", () => {
    it("filters by reason, Import Run and Generation Run, and drops resolved entries", async () => {
      const { a, item, importRun } = await given("approved");
      const request = await a.requestGeneration({ targetId: item, kind: "examples", reason: "manual" });
      const run = await a.recordGenerationRun({ requestId: request.id, model: "sonnet", promptTemplateVersion: "p1", inputs: [], tokens: 1, cost: 0 });
      const stale = await a.enqueue({ reason: "stale override", recordId: item, importRunId: importRun, detail: { field: "text" } });
      const tripped = await a.enqueue({ reason: "breaker tripped", importRunId: importRun });
      const failed = await a.enqueue({ reason: "generation failed", generationRunId: run.id });
      expect((await a.queue({ importRunId: importRun })).map((e) => e.id)).toEqual([stale.id, tripped.id]);
      expect((await a.queue({ importRunId: importRun, reason: "breaker tripped" })).map((e) => e.id)).toEqual([tripped.id]);
      expect((await a.queue({ generationRunId: run.id })).map((e) => e.id)).toEqual([failed.id]);
      expect((await a.queue({ importRunId: importRun }))[0]).toEqual(stale);
      await a.resolve(stale.id);
      expect((await a.queue({ importRunId: importRun })).map((e) => e.id)).toEqual([tripped.id]);
      expect((await a.queue()).map((e) => e.id)).toContain(failed.id);
    });
  });

};

/** Every write a decision makes lands together or not at all. */
const atomicity = (make: () => Promise<{ store: Store; graph: Graph | null; count: () => Promise<number> }>) => {
  it("rolls back every write when the work throws", async () => {
    const { store, count } = await make();
    const before = await count();
    const id = randomUUID();
    await expect(
      store.atomically(async (tx) => {
        await tx.insert("generationRequest", [{ id, targetId: id, kind: "examples", reason: "x", attempts: 0, status: "open" }]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await count()).toBe(before);
  });
};

describe("fake authoring", () => {
  contract(async () => {
    const graph = emptyGraph();
    return {
      authoring: createFakeAuthoring(graph, tickingClock()),
      seed: async (rows) => {
        for (const [name, list] of Object.entries(rows)) (graph[name as keyof Graph] as object[]).push(...list);
      },
    };
  });
  atomicity(async () => {
    const graph = emptyGraph();
    return { store: memoryStore(graph), graph, count: async () => graph.generationRequest.length };
  });
});

describe("authoring, against Postgres", () => {
  let pg: TestPostgres;
  let db: Db;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
    await migrateContentGraph(db);
  });
  afterAll(async () => {
    await db.$client.end();
    await pg.stop();
  });

  contract(async () => ({ authoring: createAuthoring(db, tickingClock()), seed: (graph) => seedContentGraph(db, graph) }));
  atomicity(async () => ({
    store: postgresStore(db),
    graph: null,
    count: async () => (await postgresStore(db).rows("generationRequest")).length,
  }));

  it("refuses to change or delete an Approval Decision", async () => {
    await expect(db.execute("UPDATE content_graph.approval_decision SET reason = 'x'")).rejects.toThrow();
    await expect(db.execute("DELETE FROM content_graph.approval_decision")).rejects.toThrow();
  });
});
