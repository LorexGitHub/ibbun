import { describe, expect, it } from "vitest";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import { createFakeAuthoring, emptyGraph } from "@ibbun/content-graph/testing";
import { createFakeJobs } from "@ibbun/jobs";
import type { Nlp } from "@ibbun/nlp";
import type { GrammarSources } from "./download.ts";
import { downloadGrammarSources } from "./download.ts";
import { japaneseTitle, parseHanabira } from "./hanabira.ts";
import { grammarSeedJob, runGrammarSeed, type GrammarSeedDeps } from "./index.ts";
import { parseTanos } from "./tanos.ts";
import { withOffsets } from "./tokens.ts";

const entry = (title: string, formation = "Noun + が + いちばん", examples = [{ jp: "寿司が一番好きです。", romaji: "x", en: "I like sushi the most." }]) => ({
  title,
  short_explanation: "the most",
  long_explanation: "A long note.",
  formation,
  examples,
});

describe("parseHanabira", () => {
  it("keeps the Japanese pattern, splits formation into slots, and carries the long explanation as notes and the examples", () => {
    const [point] = parseHanabira("N5", JSON.stringify([entry("A が いちばん～ (A ga ichiban～)")]));
    expect(point).toEqual({
      key: "N5:0",
      level: "N5",
      title: "A が いちばん～",
      meaning: "the most",
      notes: "A long note.",
      formation: ["Noun", "が", "いちばん"],
      examples: [{ text: "寿司が一番好きです。", translationEn: "I like sushi the most." }],
    });
  });

  it("keys each point by its place in the level file", () => {
    expect(parseHanabira("N3", JSON.stringify([entry("a"), entry("b")])).map((p) => p.key)).toEqual(["N3:0", "N3:1"]);
  });

  it("drops a trailing bracket in either width and leaves other brackets alone", () => {
    expect(japaneseTitle("ないではおかない (~ nai de wa okanai)")).toBe("ないではおかない");
    expect(japaneseTitle("A。しかし、～B。（A. Shikashi）")).toBe("A。しかし、～B。");
    expect(japaneseTitle("（は）〜だ")).toBe("（は）〜だ");
  });

  it("skips empty formation slots", () => {
    expect(parseHanabira("N5", JSON.stringify([entry("a", "V-て +  + しまう ")]))[0]!.formation).toEqual(["V-て", "しまう"]);
  });

  it("rejects a file that is not a list of grammar entries", () => {
    expect(() => parseHanabira("N5", JSON.stringify([{ title: "x" }]))).toThrow();
  });
});

describe("parseTanos", () => {
  const html = `<table><tr><td><a class="nounderline" href="/jlpt/skills/grammar/sentences/?grammarid=535">です</a></td></tr>
<tr><td><a href="/x/?grammarid=538">に/へ</a></td></tr><tr><td><a href="/x?grammarid=9">A &amp; B</a></td></tr>
<a href="/other">not grammar</a></table>`;

  it("reads each linked grammar id and pattern, decoding entities, and nothing else", () => {
    expect(parseTanos("N5", html)).toEqual([
      { key: "535", level: "N5", title: "です" },
      { key: "538", level: "N5", title: "に/へ" },
      { key: "9", level: "N5", title: "A & B" },
    ]);
  });
});

describe("withOffsets", () => {
  it("places each token right after the one before it", () => {
    const token = (surface: string, conjugation: { type: string; form: string } | null) => ({ surface, lemma: surface, reading: surface, partOfSpeech: ["助詞"], conjugation });
    expect(withOffsets([token("食べ", { type: "t", form: "連用形" }), token("て", null)])).toEqual([
      { surface: "食べ", lemma: "食べ", reading: "食べ", partOfSpeech: ["助詞"], conjugationForm: "連用形", start: 0, end: 2 },
      { surface: "て", lemma: "て", reading: "て", partOfSpeech: ["助詞"], conjugationForm: null, start: 2, end: 3 },
    ]);
  });
});

const nlp: Nlp = { tokenize: async (text) => [{ surface: text, lemma: text, reading: text, partOfSpeech: ["名詞"], conjugation: null }] };

const sources: GrammarSources = {
  hanabiraCommit: "abc123",
  tanosSnapshot: "2020",
  hanabira: parseHanabira("N5", JSON.stringify([entry("A が いちばん～ (A ga ichiban～)"), entry("ます", "V-ます")])),
  tanos: parseTanos("N5", '<a href="/x?grammarid=1">～がいちばん</a>'),
};

const world = () => {
  const graph = emptyGraph();
  const authoring = createFakeAuthoring(graph);
  const jobs = createFakeJobs();
  const deps: GrammarSeedDeps = { nlp, jobs, authoring, transact: (work) => work(authoring), download: async () => sources };
  return { graph, authoring, jobs, deps };
};

describe("runGrammarSeed", () => {
  it("keeps at most 16 sentences at the tokenizer at once, however many points there are", async () => {
    const w = world();
    let inFlight = 0;
    let most = 0;
    w.deps.nlp = {
      tokenize: async (text) => {
        most = Math.max(most, ++inFlight);
        await new Promise((done) => setTimeout(done, 1));
        inFlight--;
        return nlp.tokenize(text);
      },
    };
    const points = Array.from({ length: 40 }, (_, i) => ({ ...sources.hanabira[0]!, key: `N5:${i}`, title: `点${i}`, examples: [{ text: `文${i}`, translationEn: "a" }, { text: `文${i}b`, translationEn: "b" }] }));
    w.deps.download = async () => ({ ...sources, hanabira: points });
    await runGrammarSeed(w.deps);
    expect(most).toBe(16);
    expect(w.graph.sentence.map((s) => s.text)).toEqual(points.flatMap((p) => p.examples.map((e) => e.text)));
  });

  it("seeds every point from both lists as a draft Grammar Point with its list level", async () => {
    const w = world();
    expect(await runGrammarSeed(w.deps)).toBe(true);
    expect(w.graph.grammarPoint.map((p) => p.title).sort()).toEqual(["A が いちばん～", "ます", "～がいちばん"]);
    expect(w.graph.studyItem.every((i) => i.type === "grammar_point" && i.approval === "draft" && !i.retired)).toBe(true);
    expect(w.graph.levelCandidate.map((l) => [l.level, l.kind]).every(([level, kind]) => level === "N5" && kind === "list")).toBe(true);
    expect(w.graph.levelCandidate).toHaveLength(3);
  });

  it("starts hanabira's points from its text: meaning, long explanation as notes, formation slots, a form with its register", async () => {
    const w = world();
    await runGrammarSeed(w.deps);
    const masu = w.graph.grammarPoint.find((p) => p.title === "ます")!;
    expect(masu).toMatchObject({ meaning: "the most", notes: "A long note.", formation: ["V-ます"], forms: [{ text: "ます", register: "polite" }], register: "neutral", matcherRule: null });
    const tanos = w.graph.grammarPoint.find((p) => p.title === "～がいちばん")!;
    expect(tanos).toMatchObject({ meaning: "", notes: null, formation: [], forms: [{ text: "～がいちばん", register: "casual" }] });
  });

  it("records the source keys the merge proposal kind reads, one dataset per list", async () => {
    const w = world();
    await runGrammarSeed(w.deps);
    expect(w.graph.sourceKey.map((k) => [k.dataset, k.upstreamKey]).sort()).toEqual([["hanabira", "N5:0"], ["hanabira", "N5:1"], ["tanos", "1"]]);
  });

  it("imports hanabira's examples as draft Sentences credited to hanabira, each with a draft demonstrates link over the whole Sentence", async () => {
    const w = world();
    await runGrammarSeed(w.deps);
    expect(w.graph.sentence).toHaveLength(2);
    const [sentence] = w.graph.sentence;
    expect(sentence).toMatchObject({ text: "寿司が一番好きです。", translationEn: "I like sushi the most.", approval: "draft" });
    expect(sentence!.tokens).toEqual([expect.objectContaining({ start: 0, end: sentence!.text.length })]);
    const [provenance] = w.graph.provenance.filter((p) => p.id === sentence!.provenanceId);
    expect(provenance).toMatchObject({ licence: "cc-by-4.0", sourceUrl: "https://hanabira.org" });
    expect(w.graph.sentenceDemonstratesGrammar).toHaveLength(2);
    expect(w.graph.sentenceDemonstratesGrammar[0]).toMatchObject({ sentenceId: sentence!.id, spanStart: 0, spanEnd: sentence!.text.length, approval: "draft" });
    const point = w.graph.sentenceDemonstratesGrammar[0]!.grammarPointId;
    expect(w.graph.sourceKey.find((k) => k.recordId === point)?.dataset).toBe("hanabira");
  });

  it("records one applied Import Run per list with the hanabira commit and the Tanos credit", async () => {
    const w = world();
    await runGrammarSeed(w.deps);
    expect(w.graph.importRun.map((r) => [r.dataset, r.upstreamVersion, r.status]).sort()).toEqual([["hanabira", "abc123", "applied"], ["tanos-grammar", "2020", "applied"]]);
    const tanos = w.graph.provenance.find((p) => p.licence === "cc-by");
    expect(tanos?.sourceUrl).toBe("https://www.tanos.co.uk/jlpt/");
  });

  it("asks for a merge proposal for each hanabira point and for none of the Tanos points", async () => {
    const w = world();
    const queued: unknown[] = [];
    w.deps.jobs = { enqueue: async (contract, payload) => void (contract.name === ContentGenerate.name && queued.push(payload)) };
    await runGrammarSeed(w.deps);
    const requests = w.graph.generationRequest;
    expect(requests.map((r) => r.kind)).toEqual(["merge_proposal", "merge_proposal"]);
    const hanabira = new Set(w.graph.sourceKey.filter((k) => k.dataset === "hanabira").map((k) => k.recordId));
    expect(requests.every((r) => hanabira.has(r.targetId))).toBe(true);
    expect(queued).toEqual(requests.map((r) => ({ requestId: r.id })));
  });

  it("leaves no schedule and no override behind", async () => {
    const w = world();
    await runGrammarSeed(w.deps);
    expect(w.graph.override).toEqual([]);
    expect(grammarSeedJob(() => w.deps).schedule).toBeUndefined();
  });

  it("does nothing the second time", async () => {
    const w = world();
    await runGrammarSeed(w.deps);
    const sizes = () => [w.graph.studyItem.length, w.graph.sentence.length, w.graph.importRun.length, w.graph.generationRequest.length];
    const before = sizes();
    expect(await runGrammarSeed(w.deps)).toBe(false);
    expect(sizes()).toEqual(before);
  });

  it("runs as the import.grammar-seed job", async () => {
    const w = world();
    const jobs = createFakeJobs();
    await jobs.work([grammarSeedJob(() => w.deps)]);
    await jobs.enqueue(grammarSeedJob(() => w.deps).contract, {});
    await jobs.drain();
    expect(w.graph.grammarPoint).toHaveLength(3);
  });
});

describe("downloadGrammarSources", () => {
  const level = (n: string) => JSON.stringify([entry(`点${n}`)]);
  const answer = (url: string): Response => {
    if (url.includes("api.github.com")) return Response.json({ sha: "deadbeef" });
    if (url.startsWith("https://raw.githubusercontent.com/tristcoil/hanabira.org-japanese-content/deadbeef/grammar_json/")) return new Response(level(url.match(/_(N\d)_/)![1]!));
    if (url.startsWith("https://web.archive.org/web/2020id_/http://www.tanos.co.uk/jlpt/jlpt")) return new Response(`<a href="/x?grammarid=${url.match(/jlpt(\d)/)![1]}">語</a>`);
    return new Response("nope", { status: 404 });
  };

  it("reads the five hanabira level files at the latest commit and the five Tanos level pages", async () => {
    const urls: string[] = [];
    const got = await downloadGrammarSources(async (input) => (urls.push(String(input)), answer(String(input))));
    expect(got.hanabiraCommit).toBe("deadbeef");
    expect(got.hanabira.map((p) => [p.level, p.title])).toEqual([["N5", "点N5"], ["N4", "点N4"], ["N3", "点N3"], ["N2", "点N2"], ["N1", "点N1"]]);
    expect(got.tanos.map((e) => [e.level, e.key])).toEqual([["N5", "5"], ["N4", "4"], ["N3", "3"], ["N2", "2"], ["N1", "1"]]);
    expect(urls.some((u) => u.includes("usage"))).toBe(false);
  });

  it("fails when the commit lookup has no sha", async () => {
    await expect(downloadGrammarSources(async () => Response.json({}))).rejects.toThrow("no sha");
  });

  it("asks again when the Wayback Machine drops a request or answers 503", async () => {
    const asked = new Map<string, number>();
    const got = await downloadGrammarSources(async (input) => {
      const url = String(input);
      const nth = (asked.get(url) ?? 0) + 1;
      asked.set(url, nth);
      if (url.includes("jlpt5") && nth === 1) throw new TypeError("fetch failed");
      if (url.includes("jlpt4") && nth < 3) return new Response("busy", { status: 503 });
      return answer(url);
    });
    expect(got.tanos.map((e) => e.key)).toEqual(["5", "4", "3", "2", "1"]);
    expect([...asked.values()].sort()).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3]);
  });

  it("gives up after the third try, with the last failure", async () => {
    let tries = 0;
    await expect(downloadGrammarSources(async () => (tries++, Promise.reject(new TypeError("fetch failed"))))).rejects.toThrow("fetch failed");
    expect(tries).toBe(3);
    tries = 0;
    await expect(downloadGrammarSources(async () => (tries++, new Response("busy", { status: 503 })))).rejects.toThrow("503");
    expect(tries).toBe(3);
  });

  it("does not ask again for a page that is not there", async () => {
    let tries = 0;
    await expect(downloadGrammarSources(async () => (tries++, new Response("", { status: 404 })))).rejects.toThrow("404");
    expect(tries).toBe(1);
  });

  it("fails when a page is missing", async () => {
    await expect(downloadGrammarSources(async (input) => (String(input).includes("api.github") ? Response.json({ sha: "x" }) : new Response("", { status: 404 })))).rejects.toThrow("404");
  });
});
