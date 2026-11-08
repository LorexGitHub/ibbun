import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { kanjivgSource } from "./index.ts";
import { parseKanjivg } from "./parse.ts";

const kanji = (id: string, paths: string[]) =>
  `<kanji id="kvg:kanji_${id}">\n<g id="kvg:${id}" kvg:element="x">\n${paths
    .map((d, i) => `\t<path id="kvg:${id}-s${i + 1}" kvg:type="㇐" d="${d}"/>`)
    .join("\n")}\n</g>\n</kanji>`;
const file = (...kanjis: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<!-- licence -->\n<kvg>\n${kanjis.join("\n")}\n</kvg>`;

describe("parseKanjivg", () => {
  it("keys each character by code point and keeps its stroke paths in stroke order", () => {
    expect(parseKanjivg(file(kanji("04e00", ["M11,54c5.25,2.74"]), kanji("098df", ["M1,2", "M3,4", "M5,6"])))).toEqual([
      { key: "04e00", strokes: ["M11,54c5.25,2.74"] },
      { key: "098df", strokes: ["M1,2", "M3,4", "M5,6"] },
    ]);
  });

  it("leaves out variant drawings, which share a code point with the standard one", () => {
    const parsed = parseKanjivg(file(kanji("098df", ["M1,2"]), kanji("098df-Kaisho", ["M9,9"])));
    expect(parsed).toEqual([{ key: "098df", strokes: ["M1,2"] }]);
  });

  it("fails on a character with no strokes instead of wiping the ones it had", () => {
    expect(() => parseKanjivg(file(kanji("098df", [])))).toThrow(/098df/);
  });

  it("fails on a file with no characters", () => {
    expect(() => parseKanjivg(file())).toThrow(/no kanji/);
  });
});

const release = (tag: string, names: string[]) => ({
  tag_name: tag,
  assets: names.map((name) => ({ name, browser_download_url: `https://example.test/${name}` })),
});
const fakeFetch = (routes: Record<string, unknown>): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = routes[url];
    if (hit === undefined) return new Response("nope", { status: 404 });
    return hit instanceof Uint8Array ? new Response(hit as BodyInit) : Response.json(hit);
  }) as typeof fetch;

describe("kanjivgSource", () => {
  const LATEST = "https://api.github.com/repos/KanjiVG/kanjivg/releases/latest";
  const assets = ["kanjivg-20260714-main.zip", "kanjivg-20260714.xml.gz", "kanjivg-20260714-all.zip"];

  it("reports the release tag as the upstream version", async () => {
    expect(await kanjivgSource(fakeFetch({ [LATEST]: release("r20260714", assets) })).latest()).toBe("r20260714");
  });

  it("downloads the single-file xml.gz of the tag and parses it", async () => {
    const xml = gzipSync(file(kanji("098df", ["M1,2"])));
    const source = kanjivgSource(
      fakeFetch({
        "https://api.github.com/repos/KanjiVG/kanjivg/releases/tags/r20260714": release("r20260714", assets),
        "https://example.test/kanjivg-20260714.xml.gz": new Uint8Array(xml),
      }),
    );
    const files = await source.download("r20260714");
    expect(files.map((f) => f.name)).toEqual(["kanjivg-20260714.xml.gz"]);
    expect(source.parse(files)).toEqual([{ key: "098df", strokes: ["M1,2"] }]);
  });

  it("fails when the release has no xml.gz file", async () => {
    const source = kanjivgSource(fakeFetch({ [LATEST.replace("latest", "tags/r1")]: release("r1", ["kanjivg-1-main.zip"]) }));
    await expect(source.download("r1")).rejects.toThrow(/xml\.gz/);
  });
});
