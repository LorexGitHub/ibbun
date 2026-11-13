import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StudyItemId } from "@ibbun/shared";
import { createDb, type Db } from "@ibbun/db";
import { startTestPostgres, type TestPostgres } from "@ibbun/db/testing";
import { createContentGraph, type ContentGraph, type Credit } from "./index.ts";
import { createFakeAuthoring, createFakeContentGraph, emptyGraph, migrateContentGraph, seedContentGraph, type Graph, type Licence } from "./testing.ts";
import { licensing, parseLicence } from "./licensing.ts";

/** A Word from JMdict, a Tatoeba Sentence, an Example of it, a Clip voicing it, and a generated Explanation built on Wiktionary text. */
const licensedGraph = () => {
  let n = 0;
  const next = () => `00000000-0000-7000-8000-${(++n).toString().padStart(12, "0")}`;
  const graph: Graph = emptyGraph();
  const run = (dataset: string, upstreamVersion: string, appliedAt: Date | null) => {
    const id = next();
    graph.importRun.push({ id, dataset, upstreamVersion, checksum: "x", status: "applied", counts: {}, appliedAt });
    return id;
  };
  const jmdict = run("jmdict", "2026-10-05", new Date("2026-10-05T00:00:00Z"));
  run("jmdict", "2026-11-02", new Date("2026-11-02T00:00:00Z"));
  run("jmdict", "2026-11-09", null);
  const tatoeba = run("tatoeba", "2026-11-01", new Date("2026-11-01T00:00:00Z"));

  const prov = (licence: Licence, source: Graph["provenance"][number]["source"], inputs: string[] = [], author: string | null = null, sourceUrl: string | null = null) => {
    const id = next();
    graph.provenance.push({ id, source, licence, author, sourceUrl, inputs });
    return id;
  };
  const life = (provenanceId: string) => ({ approval: "approved" as const, retired: false, provenanceId });
  const fromJmdict = prov("edrdg", { kind: "import", importRunId: jmdict });

  const word = next();
  graph.studyItem.push({ id: word, type: "word", ...life(fromJmdict) });
  graph.word.push({ studyItemId: word, priorityTags: [] });
  const sense = next();
  graph.wordSense.push({ id: sense, wordId: word, position: 0, partsOfSpeech: ["v1"], glosses: ["to eat"], ...life(fromJmdict) });

  const wiktionary = next();
  const wiktionaryProv = prov("cc-by-sa-4.0", { kind: "import", importRunId: run("wiktionary-ja", "1", null) }, [], null, "https://ja.wiktionary.org/wiki/食べる");
  graph.japaneseExplanation.push({ id: wiktionary, wordSenseId: sense, grammarPointId: null, text: "原文。", ...life(wiktionaryProv) });
  const generated = prov("ibbun", { kind: "generated", model: "m", promptTemplateVersion: "1", generationRunId: next() }, [wiktionary]);
  const explanation = next();
  graph.japaneseExplanation.push({ id: explanation, wordSenseId: sense, grammarPointId: null, text: "食べること。", ...life(generated) });

  const sentence = next();
  const sentenceProv = prov("cc-by-2.0-fr", { kind: "import", importRunId: tatoeba }, [], "alice", "https://tatoeba.org/sentences/show/1");
  graph.sentence.push({ id: sentence, text: "パンを食べる。", translationEn: null, tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...life(sentenceProv) });
  const example = next();
  graph.example.push({ id: example, sentenceId: sentence, studyItemId: word, spanStart: 3, spanEnd: 6, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life(prov("ibbun", { kind: "authored", by: "test" }, [sentence])) });

  const clip = next();
  const clipProv = prov("voicevox", { kind: "derived", process: "tts", version: "1" }, [sentence], "四国めたん");
  graph.studyItem.push({ id: clip, type: "listening_clip", ...life(clipProv) });
  graph.listeningClip.push({ studyItemId: clip, kind: "sentence" });
  graph.clipVoicesSentence.push({ id: next(), clipId: clip, sentenceId: sentence, position: 0, speaker: "女", voice: "四国めたん", audioKey: null, ...life(clipProv) });

  const override = prov("ibbun", { kind: "authored", by: "supervisor" }, [sense]);
  graph.override.push({ id: next(), recordId: sense, field: "glosses", value: ["to eat", "to have"], basedOn: ["to eat"], state: "active", ...life(override) });

  return { graph, ids: { word: word as StudyItemId, clip: clip as StudyItemId, sense, explanation, sentence, example, wiktionary } };
};

const g = licensedGraph();

const edrdg: Credit = { licence: "edrdg", licenceName: "EDRDG Licence (CC BY-SA 4.0)", dataset: "jmdict", author: null, url: null, inline: false };
const tatoeba: Credit = { licence: "cc-by-2.0-fr", licenceName: "CC BY 2.0 FR", dataset: "tatoeba", author: "alice", url: "https://tatoeba.org/sentences/show/1", inline: true };
const wiktionary: Credit = { licence: "cc-by-sa-4.0", licenceName: "CC BY-SA 4.0", dataset: "wiktionary-ja", author: null, url: "https://ja.wiktionary.org/wiki/食べる", inline: true };
const voice: Credit = { licence: "voicevox", licenceName: "VOICEVOX voice terms", dataset: null, author: "四国めたん", url: null, inline: true };

describe("closed licence list", () => {
  it("accepts every approved licence and rejects anything else", () => {
    expect(parseLicence("cc-by-2.0-fr")).toBe("cc-by-2.0-fr");
    expect(() => parseLicence("cc-by-nc-4.0")).toThrow(/not on the approved list/);
  });

  it("fails to write Provenance with any other licence", async () => {
    const a = createFakeAuthoring(emptyGraph());
    const row = { id: "00000000-0000-7000-8000-000000000001", source: { kind: "authored" as const, by: "x" }, licence: "cc-by-nc-4.0" as Licence, author: null, sourceUrl: null, inputs: [] };
    await expect(a.insert("provenance", [row])).rejects.toThrow(/not on the approved list/);
    await a.insert("provenance", [{ ...row, licence: "cc0" }]);
    await expect(a.update("provenance", { id: row.id }, { licence: "gpl" as Licence })).rejects.toThrow(/not on the approved list/);
    expect((await a.rows("provenance"))[0]?.licence).toBe("cc0");
  });
});

describe("licence of a record", () => {
  const l = licensing(g.graph);

  it("is the source's licence when imported and unchanged", () => {
    expect(l.licenceOf(g.ids.sentence)).toBe("cc-by-2.0-fr");
    expect(l.licenceOf(g.ids.word)).toBe("edrdg");
  });

  it("is CC BY-SA 4.0 when any input is ShareAlike, including text placed in a generation prompt", () => {
    expect(l.licenceOf(g.ids.explanation)).toBe("cc-by-sa-4.0");
  });

  it("is ibbun-owned with no ShareAlike input, still carrying its inputs' Attribution", () => {
    expect(l.licenceOf(g.ids.example)).toBe("ibbun");
    expect(l.attributionOf([g.ids.example])).toEqual([tatoeba]);
  });

  it("follows inputs transitively and survives a cycle", () => {
    const graph = structuredClone(g.graph);
    const sentence = graph.provenance.find((p) => p.licence === "cc-by-2.0-fr")!;
    sentence.inputs = [g.ids.example];
    const cyclic = licensing(graph);
    expect(cyclic.licenceOf(g.ids.example)).toBe("ibbun");
    expect(cyclic.attributionOf([g.ids.example])).toEqual([tatoeba]);
  });

  it("follows a change of an input's credit, because it is computed rather than copied", () => {
    const graph = structuredClone(g.graph);
    graph.provenance.find((p) => p.author === "alice")!.author = "bob";
    expect(licensing(graph).attributionOf([g.ids.example])).toEqual([{ ...tatoeba, author: "bob" }]);
  });
});

const contract = (make: () => Promise<ContentGraph>) => {
  let cg: ContentGraph;
  beforeAll(async () => {
    cg = await make();
  });

  it("returns a Study Item's Attribution, from its records, their overrides and the generation prompt's texts", async () => {
    const page = await cg.studyItem(g.ids.word);
    expect(page?.attribution).toEqual([wiktionary, edrdg]);
  });

  it("returns an Example's Attribution, and its Sentence's", async () => {
    const [example] = (await cg.studyItem(g.ids.word))!.examples;
    expect(example?.attribution).toEqual([tatoeba]);
    expect(example?.sentence.attribution).toEqual([tatoeba]);
  });

  it("credits a Listening Clip's voice and the author of the Sentence it voices", async () => {
    expect((await cg.studyItem(g.ids.clip))?.attribution).toEqual([tatoeba, voice]);
  });

  it("lists every source with its licence, link and live version, then the voices in use", async () => {
    const credits = await cg.credits();
    expect(credits.find((c) => c.name === "JMdict")).toEqual({
      name: "JMdict",
      licence: "edrdg",
      licenceName: "EDRDG Licence (CC BY-SA 4.0)",
      url: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
      version: "2026-11-02",
      appliedAt: new Date("2026-11-02T00:00:00Z"),
    });
    expect(credits.find((c) => c.name === "Wiktionary (ja)")).toMatchObject({ version: null, appliedAt: null });
    expect(credits.map((c) => c.name)).toEqual([
      "JMdict", "KANJIDIC2", "KRADFILE", "JmdictFurigana", "KanjiVG (© Ulrich Apel)", "Tatoeba",
      "Jonathan Waller's JLPT Resources (Tanos)", "yomitan-jlpt-vocab (stephenmk)", "hanabira", "UniDic", "Wiktionary (ja)", "VOICEVOX:四国めたん",
    ]);
  });
};

describe("fake content graph", () => {
  contract(async () => createFakeContentGraph(g.graph));
});

describe("content graph, against Postgres", () => {
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

  it("rejects a licence outside the closed list in the database too", async () => {
    await expect(
      db.execute(sql`INSERT INTO content_graph.provenance (id, source, licence) VALUES ('00000000-0000-7000-8000-0000000000ff', '{"kind":"authored"}', 'cc-by-nc-4.0')`),
    ).rejects.toThrow();
  });

  contract(async () => {
    await seedContentGraph(db, g.graph);
    return createContentGraph(db);
  });
});
