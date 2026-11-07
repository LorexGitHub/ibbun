import { describe, expect, it } from "vitest";
import { createFakeNlp, type Token } from "@mojibun/nlp";
import { buildSentences, decodeExports, tatoebaSource, type Exports } from "./index.ts";
import { chooseTranslation, parseDetailed, parseIndexLine, parseIndices, parseNativeSpeakers } from "./parse.ts";
import { mapLimited, sudachiLinks, toStoredTokens } from "./tokens.ts";

const token = (surface: string, lemma: string, pos: string[], reading = surface): Token => ({ surface, lemma, reading, partOfSpeech: pos, conjugation: null });
const nlp = createFakeNlp([
  token("パン", "パン", ["名詞"], "パン"),
  token("を", "を", ["助詞"]),
  token("食べ", "食べる", ["動詞"], "タベ"),
  token("ます", "ます", ["助動詞"]),
  token("。", "。", ["補助記号"]),
]);

describe("chooseTranslation", () => {
  const owners: Record<string, string> = { "5": "newbie", "9": "native", "12": "native2" };
  const owner = (id: string) => owners[id] ?? null;
  it("takes the lowest id owned by a native English speaker", () => {
    expect(chooseTranslation(["12", "5", "9"], owner, new Set(["native", "native2"]))).toBe("9");
  });
  it("takes the lowest id when no owner is native, comparing ids as numbers", () => {
    expect(chooseTranslation(["12", "5", "9"], owner, new Set())).toBe("5");
    expect(chooseTranslation(["100", "20"], owner, new Set())).toBe("20");
  });
});

describe("export parsing", () => {
  it("reads author credit, treating \\N as no author", () => {
    const sentences = parseDetailed("1\tjpn\tあ\tann\t\\N\t2010\n2\tjpn\tい\t\\N\t\\N\t2010\n");
    expect(sentences.get("1")).toEqual({ text: "あ", author: "ann" });
    expect(sentences.get("2")?.author).toBeNull();
  });
  it("counts only skill level 5 as native", () => {
    expect([...parseNativeSpeakers("eng\t5\tann\t\neng\t3\tbob\t\neng\t5\t\\N\t\n")]).toEqual(["ann"]);
  });
});

describe("parseIndexLine", () => {
  it("reads headword, reading, entry, sense and surface, placing each item in the text in order", () => {
    const text = "パンを食べました。";
    expect(parseIndexLine("パン を(#1) 食べる[02]{食べました}~", text)).toEqual([
      { entry: null, form: "パン", reading: null, sense: null, start: 0, end: 2 },
      { entry: "1", form: "を", reading: null, sense: null, start: 2, end: 3 },
      { entry: null, form: "食べる", reading: null, sense: 2, start: 3, end: 8 },
    ]);
  });
  it("reads a parenthesised reading and drops an item it cannot place", () => {
    expect(parseIndexLine("為る(する){した} 走る", "それをした")).toEqual([
      { entry: null, form: "為る", reading: "する", sense: null, start: 3, end: 5 },
    ]);
  });
});

describe("parseIndices", () => {
  it("keeps a line per translation of each Japanese Sentence and skips short rows", () => {
    const found = parseIndices("11\t1\ta b\n12\t1\tc\n13\t2\td\nbroken\n14\t3");
    expect([...found]).toEqual([
      ["1", [{ english: "11", line: "a b" }, { english: "12", line: "c" }]],
      ["2", [{ english: "13", line: "d" }]],
    ]);
  });
});

describe("toStoredTokens", () => {
  it("places each token where it appears and keeps its conjugation form", () => {
    const [t] = toStoredTokens("食べた", [{ surface: "食べ", lemma: "食べる", reading: "タベ", partOfSpeech: ["動詞"], conjugation: { type: "下一段", form: "連用形" } }]);
    expect(t).toEqual({ surface: "食べ", lemma: "食べる", reading: "タベ", partOfSpeech: ["動詞"], conjugationForm: "連用形", start: 0, end: 2 });
  });
});

describe("sudachiLinks", () => {
  it("links content tokens by lemma and leaves out particles, auxiliaries and symbols", async () => {
    const text = "パンを食べます。";
    const tokens = toStoredTokens(text, await nlp.tokenize(text));
    expect(sudachiLinks(tokens).map((l) => [l.form, l.start, l.end])).toEqual([["パン", 0, 2], ["食べる", 3, 5]]);
  });
});

describe("mapLimited", () => {
  it("keeps result order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimited([1, 2, 3, 4, 5], 2, async (n) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 5 - n));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

const exports: Exports = {
  japanese: "1\tjpn\tパンを食べます。\tann\t\\N\t2010\n2\tjpn\tパンを。\tbob\t\\N\t2010\n3\tjpn\tパン\tcat\t\\N\t2010\n",
  cc0: "2\tjpn\tパンを。\t2021\n",
  links: "1\t10\n1\t11\n2\t12\n",
  english: "10\teng\tI eat bread.\tnewbie\t\\N\t2010\n11\teng\tI am eating bread.\tnative\t\\N\t2010\n12\teng\tBread.\tnewbie\t\\N\t2010\n",
  speakers: "eng\t5\tnative\t\n",
  indices: "11\t1\tパン を 食べる[01]{食べ}\n",
};

describe("buildSentences", () => {
  it("keeps Japanese Sentences with an English translation, as the rule chose it, with author and licence", async () => {
    const sentences = await buildSentences(exports, nlp);
    expect(sentences.map((s) => [s.key, s.translationEn, s.author, s.licence])).toEqual([
      ["1", "I am eating bread.", "ann", "cc-by-2.0-fr"],
      ["2", "Bread.", "bob", "cc0"],
    ]);
  });

  it("stores Sudachi tokens with offsets on every Sentence", async () => {
    const [first] = await buildSentences(exports, nlp);
    expect(first!.tokens.map((t) => [t.surface, t.start, t.end])).toEqual([["パン", 0, 2], ["を", 2, 3], ["食べ", 3, 5], ["ます", 5, 7], ["。", 7, 8]]);
    expect(first!.tokens[2]).toMatchObject({ lemma: "食べる", reading: "タベ", conjugationForm: null });
  });

  it("uses jpn_indices links where they cover the Sentence, and Sudachi's where they do not", async () => {
    const [covered, uncovered] = await buildSentences(exports, nlp);
    expect(covered!.links!.map((l) => [l.form, l.sense])).toEqual([["パン", null], ["を", null], ["食べる", 1]]);
    expect(uncovered!.links!.map((l) => l.form)).toEqual(["パン"]);
  });

  it("fails when the Sudachi sidecar fails, so a half-tokenised run cannot apply", async () => {
    const broken = { tokenize: async () => Promise.reject(new Error("sidecar down")) };
    await expect(buildSentences(exports, broken)).rejects.toThrow(/sidecar down/);
  });
});

describe("decodeExports", () => {
  const bz2 = "QlpoOTFBWSZTWX8jR7gAAAJJwQAwIAAgEUAAMAAIACAAMQAwIGTRpwUExoWtrxdyRThQkH8jR7g=";
  const bytes = (name: string) => ({ name, bytes: new Uint8Array(Buffer.from(name.endsWith(".bz2") ? bz2 : "plain", "base64")) });
  it("decompresses bzip2 files and reads the plain jpn_indices.csv as is", () => {
    const files = ["jpn_sentences_detailed.tsv.bz2", "jpn_sentences_CC0.tsv.bz2", "jpn-eng_links.tsv.bz2", "eng_sentences_detailed.tsv.bz2", "eng_user_languages.tsv.bz2"].map(bytes);
    const out = decodeExports([...files, { name: "jpn_indices.csv", bytes: new TextEncoder().encode("4\t5\tx") }]);
    expect(out.japanese).toBe("1\tjpn\tあ\tann\n");
    expect(out.indices).toBe("4\t5\tx");
  });
  it("names a missing file", () => {
    expect(() => decodeExports([])).toThrow(/no jpn_sentences_detailed/);
  });
});

describe("tatoebaSource", () => {
  const modified = "Sat, 07 Nov 2026 07:55:41 GMT";
  const upstream = (async (_url: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "HEAD" ? new Response(null, { headers: { "last-modified": modified } }) : new Response("data")) as typeof fetch;

  it("names the export by its date without downloading data", async () => {
    expect(await tatoebaSource(nlp, upstream).latest()).toBe("2026-11-07");
  });

  it("downloads every export file it reads, and only for the newest version", async () => {
    const source = tatoebaSource(nlp, upstream);
    const names = (await source.download("2026-11-07")).map((f) => f.name).sort();
    expect(names).toEqual(["eng_sentences_detailed.tsv.bz2", "eng_user_languages.tsv.bz2", "jpn-eng_links.tsv.bz2", "jpn_indices.csv", "jpn_sentences_CC0.tsv.bz2", "jpn_sentences_detailed.tsv.bz2"]);
    await expect(source.download("2026-10-31")).rejects.toThrow(/only offers its export of 2026-11-07/);
  });

  it("fails when upstream answers an error or gives no date", async () => {
    await expect(tatoebaSource(nlp, (async () => new Response("", { status: 500 })) as typeof fetch).latest()).rejects.toThrow(/500/);
    await expect(tatoebaSource(nlp, (async () => new Response(null)) as typeof fetch).latest()).rejects.toThrow(/did not say/);
  });
});

