import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { wiktionarySource } from "./index.ts";
import { parseWiktionary } from "./parse.ts";

const entry = (word: string, senses: object[], lang_code = "ja") => ({ word, lang_code, pos: "noun", senses });
const dump = (...entries: object[]) => new TextEncoder().encode(entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

describe("parseWiktionary", () => {
  it("turns each Japanese gloss into a record keyed by page, entry and gloss number", () => {
    const bytes = dump(
      entry("家族", [{ glosses: ["血縁関係による親族を基礎として成立する小集団。"] }, { glosses: ["夫婦とその子。"] }]),
      entry("拒絶", [{ glosses: ["相手の要求や希望を絶つこと。"] }]),
    );
    expect(parseWiktionary(bytes)).toEqual([
      { key: "家族#0.0", title: "家族", text: "血縁関係による親族を基礎として成立する小集団。" },
      { key: "家族#0.1", title: "家族", text: "夫婦とその子。" },
      { key: "拒絶#0.0", title: "拒絶", text: "相手の要求や希望を絶つこと。" },
    ]);
  });

  it("skips other languages, redirect stubs and cross-references without renumbering the glosses around them", () => {
    const bytes = dump(
      entry("青", [{ glosses: ["グリーン。"] }], "mul"),
      { title: "Ağustos", redirect: "ağustos", pos: "hard-redirect" },
      entry("会う", [{ glosses: ["あうの漢字表記。"], form_of: [{ word: "あう" }] }]),
      entry("弱い", [{ glosses: ["よわい　参照"] }, { glosses: ["力が小さい。"] }]),
      entry("青", [{ glosses: ["（あお）色の一つ。", "ブルー。"] }]),
      entry("青", [{ glosses: ["未熟。"] }]),
      entry("空", [{}]),
    );
    expect(parseWiktionary(bytes)).toEqual([
      { key: "弱い#0.1", title: "弱い", text: "力が小さい。" },
      { key: "青#0.0", title: "青", text: "（あお）色の一つ。：ブルー。" },
      { key: "青#1.0", title: "青", text: "未熟。" },
    ]);
  });

  it("fails the whole run on a line that is not an entry", () => {
    expect(() => parseWiktionary(dump(entry("家族", [{ glosses: ["a"] }]), { nothing: true }))).toThrow(/line 2 is not in the wiktextract format/);
  });
});

describe("wiktionarySource", () => {
  const body = gzipSync(dump(entry("家族", [{ glosses: ["小集団。"] }])));
  const modified = "Mon, 02 Nov 2026 17:36:23 GMT";
  const server = (lastModified: string | null = modified): typeof fetch =>
    (async (_url, init) => new Response(init?.method === "HEAD" ? null : body, { headers: lastModified ? { "last-modified": lastModified } : {} })) as typeof fetch;

  it("takes the extraction date as the upstream version, and downloads and parses the dump", async () => {
    const source = wiktionarySource(server());
    expect(await source.latest()).toBe("2026-11-02");
    const files = await source.download("2026-11-02");
    expect(source.parse(files)).toEqual([{ key: "家族#0.0", title: "家族", text: "小集団。" }]);
  });

  it("refuses a version the server no longer holds, and a server that gives no date", async () => {
    await expect(wiktionarySource(server()).download("2026-10-26")).rejects.toThrow(/now serves 2026-11-02/);
    await expect(wiktionarySource(server(null)).latest()).rejects.toThrow(/Last-Modified/);
  });
});
