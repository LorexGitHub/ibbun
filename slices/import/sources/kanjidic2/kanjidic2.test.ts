import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { kanjidicSource } from "./index.ts";
import { parseKanjidic } from "./parse.ts";

const reading = (type: string, value: string) => ({ type, onType: null, status: null, value });
const taberu = {
  literal: "食",
  misc: { grade: 2, strokeCounts: [9], variants: [], frequency: 328, radicalNames: [], jlptLevel: 4 },
  readingMeaning: {
    groups: [
      {
        readings: [reading("pinyin", "shi2"), reading("ja_on", "ショク"), reading("ja_on", "ジキ"), reading("ja_kun", "く.う"), reading("ja_kun", "た.べる")],
        meanings: [{ lang: "en", value: "eat" }, { lang: "en", value: "food" }, { lang: "fr", value: "manger" }],
      },
    ],
    nanori: ["あき"],
  },
};
/** A rare character: no grade, no frequency, no readings, no meanings, and two stroke counts. */
const rare = {
  literal: "丂",
  misc: { grade: null, strokeCounts: [2, 3], variants: [], frequency: null, radicalNames: [] },
  readingMeaning: null,
};
const kanjidic = (...characters: unknown[]) => JSON.stringify({ version: "3.6.2", characters });
const kradfile = (kanji: Record<string, string[]> = { 食: ["人", "良"] }) => JSON.stringify({ version: "3.6.2", kanji });

describe("parseKanjidic", () => {
  it("turns a character into a Kanji record keyed by its literal, with English meanings, On and Kun readings, grade, freq and components", () => {
    expect(parseKanjidic(kanjidic(taberu), kradfile())).toEqual([
      {
        key: "食",
        meanings: ["eat", "food"],
        onReadings: ["ショク", "ジキ"],
        kunReadings: ["く.う", "た.べる"],
        grade: 2,
        frequency: 328,
        strokeCount: 9,
        components: ["人", "良"],
        strokes: [],
      },
    ]);
  });

  it("keeps a character with no readings, meanings, grade, frequency or components, and takes the first stroke count", () => {
    expect(parseKanjidic(kanjidic(rare), kradfile())).toEqual([
      { key: "丂", meanings: [], onReadings: [], kunReadings: [], grade: null, frequency: null, strokeCount: 2, components: [], strokes: [] },
    ]);
  });

  it("keeps upstream order", () => {
    expect(parseKanjidic(kanjidic(taberu, rare), kradfile()).map((k) => k.key)).toEqual(["食", "丂"]);
  });

  it("fails the whole file when one character is not in the format, naming the character", () => {
    expect(() => parseKanjidic(kanjidic(taberu, { literal: "x" }), kradfile())).toThrow(/character #1/);
  });

  it("fails on a character that appears twice", () => {
    expect(() => parseKanjidic(kanjidic(taberu, taberu), kradfile())).toThrow(/食 appears twice/);
  });

  it("fails on a KRADFILE that is not in the format", () => {
    expect(() => parseKanjidic(kanjidic(taberu), "{}")).toThrow();
  });
});

/** A one-file tar archive, gzipped, as upstream publishes them. */
const tgz = (name: string, body: string) => {
  const header = Buffer.alloc(512);
  header.write(name, 0, "utf8");
  header.write(`${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`, 124, "ascii");
  header.write("0", 156, "ascii");
  const data = Buffer.concat([Buffer.from(body), Buffer.alloc((512 - (Buffer.byteLength(body) % 512)) % 512)]);
  return new Uint8Array(gzipSync(Buffer.concat([header, data, Buffer.alloc(1024)])));
};

describe("kanjidicSource", () => {
  const archives: Record<string, Uint8Array<ArrayBuffer>> = {
    "https://example.test/all.tgz": tgz("kanjidic2-all-3.6.2.json", kanjidic(taberu, rare)),
    "https://example.test/krad.tgz": tgz("kradfile-3.6.2.json", kradfile()),
  };
  const calls: string[] = [];
  const upstream = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/releases/latest") || url.includes("/releases/tags/")) {
      return Response.json({
        tag_name: "3.6.2+20261102210542",
        assets: [
          { name: "kanjidic2-en-3.6.2+x.json.tgz", browser_download_url: "https://example.test/en.tgz" },
          { name: "kanjidic2-all-3.6.2+x.json.tgz", browser_download_url: "https://example.test/all.tgz" },
          { name: "kradfile-3.6.2+x.json.tgz", browser_download_url: "https://example.test/krad.tgz" },
          { name: "radkfile-3.6.2+x.json.tgz", browser_download_url: "https://example.test/radk.tgz" },
        ],
      });
    }
    const archive = archives[url];
    return archive ? new Response(archive) : new Response("nope", { status: 404 });
  }) as typeof fetch;

  it("names the newest release by its tag without downloading data", async () => {
    calls.length = 0;
    expect(await kanjidicSource(upstream).latest()).toBe("3.6.2+20261102210542");
    expect(calls).toEqual(["https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"]);
  });

  it("downloads the all-languages KANJIDIC2 file and KRADFILE, not the English-only cut, and parses them", async () => {
    const source = kanjidicSource(upstream);
    const files = await source.download("3.6.2+20261102210542");
    expect(files.map((f) => f.name)).toEqual(["kanjidic2-all-3.6.2+x.json.tgz", "kradfile-3.6.2+x.json.tgz"]);
    expect((await source.parse(files)).map((k) => [k.key, k.components])).toEqual([["食", ["人", "良"]], ["丂", []]]);
  });

  it("fails when upstream answers an error or a release lacks a file", async () => {
    await expect(kanjidicSource((async () => new Response("", { status: 500 })) as typeof fetch).latest()).rejects.toThrow(/500/);
    const bare = (async () => Response.json({ tag_name: "t", assets: [] })) as typeof fetch;
    await expect(kanjidicSource(bare).download("t")).rejects.toThrow(/no kanjidic2-all/);
  });

  it("refuses raw files without both archives", async () => {
    const files = await kanjidicSource(upstream).download("3.6.2+20261102210542");
    expect(() => kanjidicSource(upstream).parse(files.slice(0, 1))).toThrow(/no kradfile/);
    expect(() => kanjidicSource(upstream).parse([])).toThrow(/no kanjidic2-all/);
  });
});
