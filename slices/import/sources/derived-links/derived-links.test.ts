import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Authoring } from "@mojibun/content-graph/authoring";
import { createFakeAuthoring, emptyGraph, type Graph } from "@mojibun/content-graph/testing";
import { DERIVED_PROCESS_VERSION, rebuildDerivedLinks } from "./index.ts";
import { chunks } from "./replace.ts";

type Source = Graph["provenance"][number]["source"];

/** A small Content Graph the tests grow: Words, Kanji, Sentences and Listening Clips, all approved. */
const build = () => {
  const graph = emptyGraph();
  const provenance = (source: Source) => {
    const id = randomUUID();
    graph.provenance.push({ id, source, licence: "mojibun", author: null, sourceUrl: null, inputs: [] });
    return id;
  };
  const life = { approval: "approved" as const, retired: false, provenanceId: provenance({ kind: "authored", by: "test" }) };
  const kanji = (literal: string) => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "kanji", ...life });
    graph.kanji.push({ studyItemId: id, literal, meanings: [], onReadings: [], kunReadings: [], grade: null, frequency: null, strokeCount: 1, components: [], strokes: [], knownWrongMeanings: [] });
    return id;
  };
  const word = (forms: string[], readings: string[], retired = false) => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "word", ...life, retired });
    graph.word.push({ studyItemId: id, priorityTags: [] });
    forms.forEach((text, position) => graph.wordForm.push({ id: randomUUID(), wordId: id, position, text, ...life }));
    readings.forEach((text, position) => graph.wordReading.push({ id: randomUUID(), wordId: id, position, text, pitchAccent: null, ...life }));
    return id;
  };
  const sentence = (text: string, tokens: { surface: string; lemma: string }[]) => {
    const id = randomUUID();
    let at = 0;
    const full = tokens.map((t) => ({ ...t, reading: "", partOfSpeech: [], conjugationForm: null, start: at, end: (at += t.surface.length) }));
    graph.sentence.push({ id, text, translationEn: null, tokens: full, audioKey: "a.wav", audioVoice: "v1", unlevelledWordCount: 0, ...life });
    return id;
  };
  const clip = (sentenceId: string) => {
    const id = randomUUID();
    graph.studyItem.push({ id, type: "listening_clip", ...life });
    graph.listeningClip.push({ studyItemId: id, kind: "sentence" });
    graph.example.push({ id: randomUUID(), sentenceId, studyItemId: id, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life });
    return id;
  };
  const importProvenance = provenance({ kind: "import", importRunId: randomUUID() });
  /** A link no rebuild wrote: what `jpn_indices` gives. */
  const importedUse = (sentenceId: string, wordId: string) => {
    graph.sentenceUsesWord.push({ id: randomUUID(), sentenceId, wordId, formId: null, readingId: null, senseId: null, spanStart: 0, spanEnd: 1, ...life, provenanceId: importProvenance });
  };
  return { graph, kanji, word, sentence, clip, importedUse, provenance };
};

let w: ReturnType<typeof build>;
let authoring: Authoring;
beforeEach(() => {
  w = build();
  authoring = createFakeAuthoring(w.graph);
});

const rebuild = () => rebuildDerivedLinks({ authoring });
const sourceOf = (provenanceId: string) => w.graph.provenance.find((p) => p.id === provenanceId)!.source;

describe("Word contains Kanji", () => {
  it("links each kanji of the first written form with its position, as approved derived links", async () => {
    const eat = w.kanji("食"), thing = w.kanji("物");
    const food = w.word(["食物", "食べ物"], ["たべもの"]);
    await rebuild();
    const links = (await authoring.rows("wordContainsKanji")).sort((a, b) => a.position - b.position);
    expect(links.map(({ wordId, kanjiId, position, approval, retired }) => ({ wordId, kanjiId, position, approval, retired }))).toEqual([
      { wordId: food, kanjiId: eat, position: 0, approval: "approved", retired: false },
      { wordId: food, kanjiId: thing, position: 1, approval: "approved", retired: false },
    ]);
    expect(sourceOf(links[0]!.provenanceId)).toEqual({ kind: "derived", process: "word-contains-kanji", version: DERIVED_PROCESS_VERSION });
  });

  it("uses a later written form when the first has no kanji, and ignores characters with no Kanji", async () => {
    const eat = w.kanji("食");
    const word = w.word(["たべる", "食べる", "亜"], []);
    await rebuild();
    expect((await authoring.rows("wordContainsKanji")).map((l) => [l.wordId, l.kanjiId, l.position])).toEqual([[word, eat, 0]]);
  });

  it("takes the first form by position, not by the order rows were stored", async () => {
    const eat = w.kanji("食"), drink = w.kanji("飲");
    const word = w.word(["食", "飲"], []);
    w.graph.wordForm.reverse();
    await rebuild();
    expect((await authoring.rows("wordContainsKanji")).map((l) => [l.wordId, l.kanjiId])).toEqual([[word, eat]]);
    expect(drink).not.toBe(eat);
  });

  it("skips retired Words", async () => {
    w.kanji("食");
    w.word(["食"], [], true);
    await rebuild();
    expect(await authoring.rows("wordContainsKanji")).toEqual([]);
  });
});

describe("Sudachi Sentence uses Word", () => {
  it("links a Sentence's tokens to Words by dictionary form, with the token's character span", async () => {
    const eat = w.word(["食べる"], ["たべる"]);
    const bread = w.word(["パン"], ["ぱん"]);
    const s = w.sentence("パンを食べた", [
      { surface: "パン", lemma: "パン" },
      { surface: "を", lemma: "を" },
      { surface: "食べ", lemma: "食べる" },
      { surface: "た", lemma: "た" },
    ]);
    await rebuild();
    const uses = (await authoring.rows("sentenceUsesWord")).filter((l) => l.sentenceId === s).sort((a, b) => a.spanStart - b.spanStart);
    expect(uses.map((l) => [l.wordId, l.spanStart, l.spanEnd, l.senseId])).toEqual([[bread, 0, 2, null], [eat, 3, 5, null]]);
    expect(uses.every((l) => l.formId !== null && l.approval === "approved")).toBe(true);
  });

  it("matches a kana-only Word by its reading, in hiragana, when the lemma is katakana", async () => {
    const word = w.word([], ["ぱん"]);
    const s = w.sentence("パン", [{ surface: "パン", lemma: "パン" }]);
    await rebuild();
    expect((await authoring.rows("sentenceUsesWord")).map((l) => [l.sentenceId, l.wordId, l.formId === null, l.readingId !== null])).toEqual([[s, word, true, true]]);
  });

  it("leaves a Sentence alone when another process, like jpn_indices, already linked it", async () => {
    const eat = w.word(["食べる"], []);
    w.word(["食べる"], []);
    const s = w.sentence("食べる", [{ surface: "食べる", lemma: "食べる" }]);
    w.importedUse(s, eat);
    await rebuild();
    expect((await authoring.rows("sentenceUsesWord")).map((l) => l.wordId)).toEqual([eat]);
  });

  it("drops its own links for a Sentence once jpn_indices covers it", async () => {
    const eat = w.word(["食べる"], []);
    const s = w.sentence("食べる", [{ surface: "食べる", lemma: "食べる" }]);
    await rebuild();
    expect(await authoring.rows("sentenceUsesWord")).toHaveLength(1);
    w.importedUse(s, eat);
    await rebuild();
    expect((await authoring.rows("sentenceUsesWord")).map((l) => sourceOf(l.provenanceId).kind)).toEqual(["import"]);
  });

  it("skips retired Sentences and tokens no Word has", async () => {
    w.word(["食べる"], []);
    w.sentence("犬", [{ surface: "犬", lemma: "犬" }]);
    const retired = w.sentence("食べる", [{ surface: "食べる", lemma: "食べる" }]);
    w.graph.sentence.find((s) => s.id === retired)!.retired = true;
    await rebuild();
    expect(await authoring.rows("sentenceUsesWord")).toEqual([]);
  });
});

describe("Listening Clip voices Sentence", () => {
  it("links a single-Sentence clip to its Example's Sentence with the Sentence Audio's voice and key", async () => {
    const s = w.sentence("パン", []);
    const clip = w.clip(s);
    await rebuild();
    expect((await authoring.rows("clipVoicesSentence")).map(({ clipId, sentenceId, position, voice, audioKey }) => ({ clipId, sentenceId, position, voice, audioKey }))).toEqual([
      { clipId: clip, sentenceId: s, position: 0, voice: "v1", audioKey: "a.wav" },
    ]);
  });

  it("links nothing for a clip whose Sentence is retired", async () => {
    const s = w.sentence("パン", []);
    w.clip(s);
    w.graph.sentence.find((x) => x.id === s)!.retired = true;
    await rebuild();
    expect(await authoring.rows("clipVoicesSentence")).toEqual([]);
  });

  it("links nothing for a Sentence without audio", async () => {
    const s = w.sentence("パン", []);
    w.graph.sentence.find((x) => x.id === s)!.audioVoice = null;
    w.clip(s);
    await rebuild();
    expect(await authoring.rows("clipVoicesSentence")).toEqual([]);
  });
});

describe("superseded by", () => {
  it("links a retired Word to the one surviving Word that holds all its form and reading pairs", async () => {
    const old = w.word(["御飯"], ["ごはん"], true);
    const successor = w.word(["御飯", "ご飯"], ["ごはん"]);
    await rebuild();
    expect((await authoring.rows("wordSupersededBy")).map((l) => [l.retiredWordId, l.wordId, l.approval])).toEqual([[old, successor, "approved"]]);
  });

  it("links nothing when two surviving Words share the pairs, or none does", async () => {
    w.word(["橋"], ["はし"], true);
    w.word(["橋"], ["はし"]);
    w.word(["橋"], ["はし"]);
    w.word(["箸"], ["はし"], true);
    await rebuild();
    expect(await authoring.rows("wordSupersededBy")).toEqual([]);
  });

  it("replaces the link a refresh wrote with its own, since both are derived", async () => {
    const old = w.word(["御飯"], ["ごはん"], true);
    const successor = w.word(["御飯"], ["ごはん"]);
    const refresh = w.provenance({ kind: "derived", process: "refresh", version: "1" });
    const written = randomUUID();
    w.graph.wordSupersededBy.push({ id: written, retiredWordId: old, wordId: successor, approval: "approved", retired: false, provenanceId: refresh });
    await rebuild();
    const links = await authoring.rows("wordSupersededBy");
    expect(links.map((l) => [l.retiredWordId, l.wordId, sourceOf(l.provenanceId)])).toEqual([
      [old, successor, { kind: "derived", process: "superseded-by", version: DERIVED_PROCESS_VERSION }],
    ]);
  });
});

describe("rebuilds", () => {
  const links = async () => JSON.stringify([await authoring.rows("wordContainsKanji"), await authoring.rows("sentenceUsesWord"), await authoring.rows("clipVoicesSentence"), await authoring.rows("wordSupersededBy")]);

  it("leaves every link untouched when nothing changed, and reports no writes", async () => {
    w.kanji("食");
    w.word(["食べる"], ["たべる"]);
    w.sentence("食べる", [{ surface: "食べる", lemma: "食べる" }]);
    const first = await rebuild();
    const before = await links();
    const second = await rebuild();
    expect(first.added).toBe(2);
    expect(second).toEqual({ added: 0, removed: 0 });
    expect(await links()).toBe(before);
  });

  it("replaces only the links whose inputs changed, never retiring them", async () => {
    w.kanji("食");
    const eat = w.word(["食べる"], ["たべる"]);
    w.kanji("飲");
    const drink = w.word(["飲む"], ["のむ"]);
    await rebuild();
    const kept = (await authoring.rows("wordContainsKanji")).find((l) => l.wordId === drink)!;
    w.kanji("喰");
    w.graph.wordForm.find((f) => f.wordId === eat)!.text = "喰べる";
    expect(await rebuild()).toEqual({ added: 1, removed: 1 });
    const after = await authoring.rows("wordContainsKanji");
    expect(after.find((l) => l.id === kept.id)).toEqual(kept);
    expect(after).toHaveLength(2);
    expect(after.every((l) => !l.retired)).toBe(true);
  });

  it("removes a link whose input is gone", async () => {
    w.kanji("食");
    const word = w.word(["食"], []);
    await rebuild();
    w.graph.studyItem.find((i) => i.id === word)!.retired = true;
    expect(await rebuild()).toEqual({ added: 0, removed: 1 });
    expect(await authoring.rows("wordContainsKanji")).toEqual([]);
  });

  it("rebuilds everything when the process version changed, whatever the inputs", async () => {
    w.kanji("食");
    w.word(["食"], []);
    await rebuild();
    const [stale] = await authoring.rows("wordContainsKanji");
    w.graph.provenance.find((p) => p.id === stale!.provenanceId)!.source = { kind: "derived", process: "word-contains-kanji", version: "0" };
    expect(await rebuild()).toEqual({ added: 1, removed: 1 });
    const [fresh] = await authoring.rows("wordContainsKanji");
    expect(fresh!.id).not.toBe(stale!.id);
    expect(sourceOf(fresh!.provenanceId)).toMatchObject({ version: DERIVED_PROCESS_VERSION });
  });

  it("shares one Provenance row per process and version across rebuilds, four processes in all", async () => {
    w.kanji("食");
    w.word(["食"], []);
    await rebuild();
    w.kanji("飲");
    w.word(["飲"], []);
    await rebuild();
    expect(w.graph.provenance.filter((p) => p.source.kind === "derived")).toHaveLength(4);
  });
});

describe("chunks", () => {
  it("splits a list into batches of at most the size, keeping order, and an empty list into none", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    expect(chunks([], 2)).toEqual([]);
  });
});
