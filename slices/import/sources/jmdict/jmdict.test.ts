import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { jmdictSource } from "./index.ts";
import { parseJmdict } from "./parse.ts";
import { untgz } from "../tgz.ts";

const kanjiEntry = {
  id: "1358280",
  kanji: [{ common: true, text: "食べる", tags: [] }],
  kana: [{ common: true, text: "たべる", tags: [], appliesToKanji: ["*"] }],
  sense: [
    { partOfSpeech: ["v1", "vt"], gloss: [{ lang: "eng", text: "to eat" }, { lang: "eng", text: "to live on" }] },
    { partOfSpeech: ["v1"], gloss: [{ lang: "ger", text: "essen" }] },
  ],
};
const kanaOnlyEntry = {
  id: "1011470",
  kanji: [],
  kana: [{ common: false, text: "べちゃんこ", tags: [], appliesToKanji: ["*"] }],
  sense: [{ partOfSpeech: ["adj-no"], gloss: [{ lang: "eng", text: "squished flat" }] }],
};
const dictionary = (...words: unknown[]) => JSON.stringify({ version: "3.6.2", words });

/** A one-file tar archive, gzipped, as upstream publishes them. */
const tgz = (name: string, content: string, extra: { name: string; content: string }[] = []) => {
  const block = (n: string, body: string) => {
    const header = Buffer.alloc(512);
    header.write(n, 0, "utf8");
    header.write(`${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`, 124, "ascii");
    header.write("0", 156, "ascii");
    return Buffer.concat([header, Buffer.from(body), Buffer.alloc((512 - (Buffer.byteLength(body) % 512)) % 512)]);
  };
  const files = [{ name, content }, ...extra].map((f) => block(f.name, f.content));
  return new Uint8Array(gzipSync(Buffer.concat([...files, Buffer.alloc(1024)])));
};

describe("parseJmdict", () => {
  it("turns an entry into a Word record keyed by ent_seq, keeping only English glosses", () => {
    const [word] = parseJmdict(dictionary(kanjiEntry));
    expect(word).toEqual({
      key: "1358280",
      forms: ["食べる"],
      readings: [{ text: "たべる", pitchAccent: null }],
      senses: [
        { partsOfSpeech: ["v1", "vt"], glosses: ["to eat", "to live on"] },
        { partsOfSpeech: ["v1"], glosses: [] },
      ],
      priorityTags: ["common"],
    });
  });

  it("keeps an entry with no kanji form, and marks it uncommon when no form is common", () => {
    expect(parseJmdict(dictionary(kanaOnlyEntry))[0]).toMatchObject({ forms: [], readings: [{ text: "べちゃんこ" }], priorityTags: [] });
  });

  it("keeps upstream order", () => {
    expect(parseJmdict(dictionary(kanjiEntry, kanaOnlyEntry)).map((w) => w.key)).toEqual(["1358280", "1011470"]);
  });

  it("fails the whole file when one entry is not in the format, naming the entry", () => {
    expect(() => parseJmdict(dictionary(kanjiEntry, { id: "7", kanji: [], kana: [], sense: [] }))).toThrow(/entry #1/);
  });

  it("fails on an entry that appears twice", () => {
    expect(() => parseJmdict(dictionary(kanjiEntry, kanjiEntry))).toThrow(/1358280 appears twice/);
  });

  it("fails on a file that is not a jmdict-simplified dictionary", () => {
    expect(() => parseJmdict("{}")).toThrow();
  });
});

describe("untgz", () => {
  it("reads every file of the archive", () => {
    const files = untgz(tgz("a.json", "alpha", [{ name: "b.txt", content: "x".repeat(600) }]));
    expect(files.map((f) => [f.name, f.bytes.length])).toEqual([["a.json", 5], ["b.txt", 600]]);
    expect(new TextDecoder().decode(files[0]!.bytes)).toBe("alpha");
  });
});

describe("jmdictSource", () => {
  const archive = tgz("jmdict-eng-3.6.2.json", dictionary(kanjiEntry));
  const calls: string[] = [];
  const upstream = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/releases/latest") || url.includes("/releases/tags/")) {
      return Response.json({
        tag_name: "3.6.2+20261102210542",
        assets: [
          { name: "jmdict-eng-common-3.6.2+x.json.tgz", browser_download_url: "https://example.test/common.tgz" },
          { name: "jmdict-eng-3.6.2+x.json.tgz", browser_download_url: "https://example.test/eng.tgz" },
        ],
      });
    }
    if (url === "https://example.test/eng.tgz") return new Response(archive);
    return new Response("nope", { status: 404 });
  }) as typeof fetch;

  it("names the newest release by its tag without downloading data", async () => {
    calls.length = 0;
    expect(await jmdictSource(upstream).latest()).toBe("3.6.2+20261102210542");
    expect(calls).toEqual(["https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"]);
  });

  it("downloads the full English file of a release, not the common-only one, and parses it", async () => {
    const source = jmdictSource(upstream);
    const files = await source.download("3.6.2+20261102210542");
    expect(files.map((f) => f.name)).toEqual(["jmdict-eng-3.6.2+x.json.tgz"]);
    expect(calls.at(-1)).toBe("https://example.test/eng.tgz");
    expect((await source.parse(files)).map((w) => w.key)).toEqual(["1358280"]);
  });

  it("fails when upstream answers an error or a release lacks the file", async () => {
    await expect(jmdictSource((async () => new Response("", { status: 500 })) as typeof fetch).latest()).rejects.toThrow(/500/);
    const bare = (async () => Response.json({ tag_name: "t", assets: [] })) as typeof fetch;
    await expect(jmdictSource(bare).download("t")).rejects.toThrow(/no jmdict-eng/);
  });

  it("refuses raw files without the archive", () => {
    expect(() => jmdictSource(upstream).parse([])).toThrow(/no jmdict-eng/);
  });
});
