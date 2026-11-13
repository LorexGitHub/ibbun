import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JlptLevel } from "@ibbun/shared";
import { createDb, type Db } from "@ibbun/db";
import { startTestPostgres, type TestPostgres } from "@ibbun/db/testing";
import { memoryStore, postgresStore, type Store } from "../authoring/store.ts";
import { emptyGraph, type Graph } from "../graph.ts";
import type { Approval } from "../schema.ts";
import { createFakeLevels, migrateContentGraph, seedContentGraph } from "../testing.ts";
import { createLevels, currentLevel, derivedLevel, hardest, PROCESS, type Levels } from "./index.ts";

type Kind = "editorial" | "list" | "derived";
const cand = (level: JlptLevel, kind: Kind, approval: Approval = "approved", retired = false, id: string = randomUUID()) =>
  ({ id, studyItemId: "x", level, kind, approval, retired, provenanceId: "p" });

describe("level rules", () => {
  it("ranks Editorial over List over Derived, ignoring unapproved and retired candidates", () => {
    expect(currentLevel([cand("N1", "derived"), cand("N4", "list"), cand("N5", "editorial")])).toBe("N5");
    expect(currentLevel([cand("N1", "derived"), cand("N4", "list"), cand("N5", "editorial", "draft")])).toBe("N4");
    expect(currentLevel([cand("N1", "derived"), cand("N4", "list", "approved", true)])).toBe("N1");
    expect(currentLevel([cand("N3", "list", "rejected")])).toBeNull();
    expect(currentLevel([])).toBeNull();
  });

  it("takes the newest candidate within a kind", () => {
    expect(currentLevel([cand("N4", "list", "approved", false, "a"), cand("N3", "list", "approved", false, "b")])).toBe("N3");
  });

  it("derives N1 only for a jōyō Kanji with no approved List candidate", () => {
    expect(derivedLevel(1, [])).toBe("N1");
    expect(derivedLevel(8, [cand("N2", "list", "draft")])).toBe("N1");
    expect(derivedLevel(9, [])).toBeNull();
    expect(derivedLevel(0, [])).toBeNull();
    expect(derivedLevel(null, [])).toBeNull();
    expect(derivedLevel(3, [cand("N2", "list")])).toBeNull();
    expect(derivedLevel(3, [cand("N2", "editorial")])).toBe("N1");
  });

  it("finds the hardest level", () => {
    expect(hardest(["N5", "N2", "N4"])).toBe("N2");
    expect(hardest(["N1", "N5"])).toBe("N1");
    expect(hardest([])).toBeNull();
  });
});

/** Fresh IDs each call, so tests share one Postgres database. */
const world = () => {
  const graph = emptyGraph();
  const provenanceId = randomUUID();
  const life = (approval: Approval = "approved", retired = false) => ({ approval, retired, provenanceId });
  graph.provenance.push({ id: provenanceId, source: { kind: "authored", by: "test" }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] });
  const item = (type: "kanji" | "word" | "grammar_point" | "listening_clip", approval?: Approval) => {
    const id = randomUUID();
    graph.studyItem.push({ id, type, ...life(approval) });
    return id;
  };
  const kanji = (grade: number | null, approval?: Approval) => {
    const id = item("kanji", approval);
    graph.kanji.push({ studyItemId: id, literal: id, meanings: [], onReadings: [], kunReadings: [], grade, frequency: null, strokeCount: 1, components: [], strokes: [], knownWrongMeanings: [] });
    return id;
  };
  const word = (approval?: Approval) => {
    const id = item("word", approval);
    graph.word.push({ studyItemId: id, priorityTags: [] });
    return id;
  };
  const grammar = () => {
    const id = item("grammar_point");
    graph.grammarPoint.push({ studyItemId: id, title: "て", forms: [], formation: [], register: "neutral", meaning: "", notes: null, matcherRule: null });
    return id;
  };
  const level = (studyItemId: string, lvl: JlptLevel, kind: Kind, approval?: Approval) => {
    const id = randomUUID();
    graph.levelCandidate.push({ id, studyItemId, level: lvl, kind, ...life(approval) });
    return id;
  };
  const sentence = (words: string[], grammars: string[] = [], linkApproval?: Approval) => {
    const id = randomUUID();
    graph.sentence.push({ id, text: "文", translationEn: null, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life() });
    for (const wordId of words)
      graph.sentenceUsesWord.push({ id: randomUUID(), sentenceId: id, wordId, formId: null, readingId: null, senseId: null, spanStart: 0, spanEnd: 1, ...life(linkApproval) });
    for (const grammarPointId of grammars)
      graph.sentenceDemonstratesGrammar.push({ id: randomUUID(), sentenceId: id, grammarPointId, spanStart: 0, spanEnd: 1, ...life() });
    return id;
  };
  const passage = (sentences: string[]) => {
    const id = randomUUID();
    graph.readingPassage.push({ id, title: "話", form: "prose", comprehensionQuestions: [], ...life() });
    sentences.forEach((sentenceId, position) => graph.passageContainsSentence.push({ id: randomUUID(), passageId: id, sentenceId, position, speaker: null, ...life() }));
    return id;
  };
  const clip = (sentences: string[]) => {
    const id = item("listening_clip");
    graph.listeningClip.push({ studyItemId: id, kind: "dialogue" });
    sentences.forEach((sentenceId, position) =>
      graph.clipVoicesSentence.push({ id: randomUUID(), clipId: id, sentenceId, position, speaker: "男", voice: "v", audioKey: null, ...life() }),
    );
    return id;
  };
  return { graph, kanji, word, grammar, level, sentence, passage, clip };
};

type Harness = { levels: Levels; store: Store; seed: (graph: Graph) => Promise<void> };

const contract = (make: () => Promise<Harness>) => {
  let h: Harness;
  beforeAll(async () => {
    h = await make();
  });
  const cached = async (recordId: string) => (await h.store.rows("computedLevel", { recordId }))[0];
  const candidatesOf = async (studyItemId: string) => h.store.rows("levelCandidate", { studyItemId });
  const disagreements = async (recordId: string) => h.store.rows("queueEntry", { recordId, reason: "level disagreement" });

  it("caches the current level of each Study Item, or Unlevelled", async () => {
    const w = world();
    const a = w.word();
    w.level(a, "N4", "list");
    w.level(a, "N5", "editorial");
    const b = w.word();
    w.level(b, "N3", "list", "draft");
    await h.seed(w.graph);
    await h.levels.rebuild();
    expect(await cached(a)).toMatchObject({ recordTable: "study_item", level: "N5" });
    expect((await cached(b))?.level).toBeNull();
  });

  it("gives a jōyō Kanji with no List candidate a Derived N1 with the process's Provenance", async () => {
    const w = world();
    const joyo = w.kanji(2);
    const listed = w.kanji(2);
    w.level(listed, "N4", "list");
    const hyogai = w.kanji(null);
    await h.seed(w.graph);
    await h.levels.rebuild();
    const [derived] = await candidatesOf(joyo);
    expect(derived).toMatchObject({ kind: "derived", level: "N1", approval: "approved", retired: false });
    const [provenance] = await h.store.rows("provenance", { id: derived!.provenanceId });
    expect(provenance?.source).toEqual({ kind: "derived", process: PROCESS, version: "1" });
    expect((await cached(joyo))?.level).toBe("N1");
    expect((await candidatesOf(listed)).filter((c) => c.kind === "derived")).toEqual([]);
    expect(await candidatesOf(hyogai)).toEqual([]);
  });

  it("is idempotent", async () => {
    const w = world();
    const joyo = w.kanji(5);
    await h.seed(w.graph);
    await h.levels.rebuild();
    await h.levels.rebuild();
    await h.levels.rebuild({ studyItemIds: [joyo] });
    expect(await candidatesOf(joyo)).toHaveLength(1);
  });

  it("rebuilds incrementally: a new List candidate retires the Derived one and re-levels linked Sentences", async () => {
    const w = world();
    const k = w.kanji(3);
    const word = w.word();
    const s = w.sentence([], []);
    await h.seed(w.graph);
    await h.levels.rebuild();
    expect((await cached(s))?.level).toBeNull();
    const provenanceId = w.graph.provenance[0]!.id;
    const life = { approval: "approved", retired: false, provenanceId } as const;
    await h.store.insert("sentenceUsesWord", [{ id: randomUUID(), sentenceId: s, wordId: word, formId: null, readingId: null, senseId: null, spanStart: 0, spanEnd: 1, ...life }]);
    await h.store.insert("levelCandidate", [
      { id: randomUUID(), studyItemId: word, level: "N3", kind: "list", ...life },
      { id: randomUUID(), studyItemId: k, level: "N4", kind: "list", ...life },
    ]);
    const result = await h.levels.rebuild({ studyItemIds: [k, word] });
    expect(result.full).toBe(false);
    expect(result.derivedRetired).toBe(1);
    expect((await candidatesOf(k)).find((c) => c.kind === "derived")?.retired).toBe(true);
    expect((await cached(k))?.level).toBe("N4");
    expect(await cached(s)).toMatchObject({ recordTable: "sentence", level: "N3", unlevelledWordCount: 0 });
  });

  it("leaves items outside an incremental rebuild alone", async () => {
    const w = world();
    const a = w.word();
    const b = w.word();
    await h.seed(w.graph);
    await h.levels.rebuild({ studyItemIds: [a] });
    expect(await cached(a)).toBeDefined();
    expect(await cached(b)).toBeUndefined();
  });

  it("rebuilds in full when the process version changes", async () => {
    const w = world();
    const k = w.kanji(1);
    await h.seed(w.graph);
    await h.levels.rebuild();
    const [old] = await candidatesOf(k);
    await h.store.update("levelProcess", { process: PROCESS }, { version: "0" });
    const result = await h.levels.rebuild({ studyItemIds: [] });
    expect(result.full).toBe(true);
    const after = await candidatesOf(k);
    expect(after.find((c) => c.id === old!.id)?.retired).toBe(true);
    expect(after.filter((c) => !c.retired)).toMatchObject([{ kind: "derived", level: "N1" }]);
    expect((await h.store.rows("levelProcess", { process: PROCESS }))[0]?.version).toBe("1");
  });

  it("levels Sentences by their hardest Word or Grammar Point, ignoring and counting Unlevelled Words", async () => {
    const w = world();
    const n5 = w.word();
    w.level(n5, "N5", "list");
    const unlevelled = w.word();
    const rare = w.word();
    const gp = w.grammar();
    w.level(gp, "N3", "list");
    const s1 = w.sentence([n5, unlevelled, rare], [gp]);
    const s2 = w.sentence([unlevelled]);
    const s3 = w.sentence([n5, unlevelled], [], "draft");
    await h.seed(w.graph);
    await h.levels.rebuild();
    expect(await cached(s1)).toMatchObject({ level: "N3", unlevelledWordCount: 2 });
    expect(await cached(s2)).toMatchObject({ level: null, unlevelledWordCount: 1 });
    expect(await cached(s3)).toMatchObject({ level: null, unlevelledWordCount: 0 });
    expect((await h.store.rows("sentence", { id: s1 }))[0]?.unlevelledWordCount).toBe(2);
  });

  it("levels Reading Passages and Listening Clips by their Sentences", async () => {
    const w = world();
    const easy = w.word();
    w.level(easy, "N5", "list");
    const hard = w.word();
    w.level(hard, "N2", "editorial");
    const none = w.word();
    const s1 = w.sentence([easy, none]);
    const s2 = w.sentence([hard, none]);
    const p = w.passage([s1, s2]);
    const c = w.clip([s1]);
    await h.seed(w.graph);
    await h.levels.rebuild();
    expect(await cached(p)).toMatchObject({ recordTable: "reading_passage", level: "N2", unlevelledWordCount: 1 });
    expect(await cached(c)).toMatchObject({ recordTable: "listening_clip", level: "N5", unlevelledWordCount: 1 });
  });

  it("queues `level disagreement` once when a List candidate disagrees with the current level", async () => {
    const w = world();
    const a = w.word();
    w.level(a, "N4", "list");
    w.level(a, "N3", "editorial");
    const agreed = w.word();
    w.level(agreed, "N4", "list");
    await h.seed(w.graph);
    await h.levels.rebuild();
    await h.levels.rebuild({ studyItemIds: [a] });
    const queued = await disagreements(a);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ resolved: false, detail: { list: "N4", current: "N3" } });
    expect(await disagreements(agreed)).toEqual([]);
    await h.store.update("queueEntry", { id: queued[0]!.id }, { resolved: true });
    await h.levels.rebuild({ studyItemIds: [a] });
    expect(await disagreements(a)).toHaveLength(1);
  });
};

describe("levels, in memory", () => {
  contract(async () => {
    const graph = emptyGraph();
    return { levels: createFakeLevels(graph), store: memoryStore(graph), seed: async (g) => {
      for (const [name, rows] of Object.entries(g)) (graph[name as keyof Graph] as object[]).push(...(rows as object[]));
    } };
  });
});

describe("levels, against Postgres", () => {
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
  contract(async () => ({ levels: createLevels(db), store: postgresStore(db), seed: (graph) => seedContentGraph(db, graph) }));
});
