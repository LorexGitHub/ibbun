import { describe, expect, it } from "vitest";
import { SNAPSHOT, tanosSource } from "./index.ts";
import { LEVELS, fileOf, parseKanjiLevels } from "./parse.ts";

const row = (kanji: string, id: number) =>
  `<tr><td><a class="nounderline" href="/jlpt/skills/kanji/sentences/?kanjiid=${id}">${kanji} </a></td><td><a href="x"> ニチ </a></td><td><a href="x"> ひ </a></td><td><a href="x">day</a></td></tr>`;
const page = (...kanji: string[]) =>
  `<html><title>JLPT kanji list</title><table><tr><th>Kanji</th><th>Onyomi</th><th>Kunyomi</th><th>English</th></tr>\n${kanji.map((k, i) => row(k, i)).join("\n")}\n</table></html>`;
const FILLER = { N5: "あ", N4: "い", N3: "う", N2: "え", N1: "お" };
type Pages = Partial<Record<(typeof LEVELS)[number], string[]>>;
const lists = (pages: Pages) => LEVELS.map((level) => ({ name: fileOf(level), text: page(...(pages[level] ?? [FILLER[level]])) }));
const parse = (pages: Pages) => {
  const lines: string[] = [];
  return { records: parseKanjiLevels(lists(pages), (l) => lines.push(l)), lines };
};
const withN1 = (text: string) => () => parseKanjiLevels([...lists({}).slice(0, 4), { name: "n1.html", text }], () => {});

describe("parseKanjiLevels", () => {
  it("gives each listed Kanji its level, easiest list first", () => {
    const { records } = parse({ N5: ["日", "一"], N4: ["会"], N3: ["政"], N2: ["堤"], N1: ["亜"] });
    expect(records).toEqual([
      { key: "日", level: "N5" },
      { key: "一", level: "N5" },
      { key: "会", level: "N4" },
      { key: "政", level: "N3" },
      { key: "堤", level: "N2" },
      { key: "亜", level: "N1" },
    ]);
  });

  it("keeps the easiest level for a Kanji on two lists and reports each collision", () => {
    const { records, lines } = parse({ N5: ["日"], N4: ["会"], N3: ["会"], N2: ["日"] });
    expect(records).toEqual([
      { key: "日", level: "N5" },
      { key: "会", level: "N4" },
      { key: "お", level: "N1" },
    ]);
    expect(lines).toEqual(["会 is also listed at N3: kept N4", "日 is also listed at N2: kept N5"]);
  });

  it("is quiet when a Kanji repeats within one list", () => {
    const { records, lines } = parse({ N5: ["日", "日"] });
    expect(records.filter((r) => r.key === "日")).toEqual([{ key: "日", level: "N5" }]);
    expect(lines).toEqual([]);
  });

  it("fails the whole run on a missing file", () => {
    expect(() => parseKanjiLevels(lists({}).slice(0, 4), () => {})).toThrow(/no n1\.html/);
  });

  it("fails on a page with no Kanji rows, so a changed page cannot half-apply", () => {
    expect(withN1("<html>gone</html>")).toThrow(/n1\.html lists no Kanji/);
  });

  it("fails on a first cell that is not exactly one character", () => {
    expect(withN1(page("日本"))).toThrow(/n1\.html row #1 \("日本"\) is not one character/);
    expect(withN1(page(""))).toThrow(/is not one character/);
  });

  it("accepts a Kanji outside the BMP", () => {
    expect(parse({ N1: ["𠮟"] }).records).toContainEqual({ key: "𠮟", level: "N1" });
  });
});

describe("tanosSource", () => {
  const respond = (body: string, status = 200) => new Response(body, { status });

  it("takes the archive snapshot as the one version and downloads the five pages from it", async () => {
    const calls: string[] = [];
    const source = tanosSource((async (url: string | URL | Request) => (calls.push(String(url)), respond(page("日")))) as typeof fetch, () => {});
    expect(source.dataset).toBe("tanos");
    expect(await source.latest()).toBe(SNAPSHOT);
    expect(calls).toEqual([]);
    const files = await source.download(SNAPSHOT);
    expect(files.map((f) => f.name)).toEqual(["n5.html", "n4.html", "n3.html", "n2.html", "n1.html"]);
    expect(calls).toEqual([5, 4, 3, 2, 1].map((n) => `https://web.archive.org/web/${SNAPSHOT}id_/http://www.tanos.co.uk/jlpt/jlpt${n}/kanji/`));
    expect(source.parse(files)).toEqual([{ key: "日", level: "N5" }]);
  });

  it("refuses a version it does not hold", async () => {
    await expect(tanosSource((async () => respond("")) as typeof fetch, () => {}).download("2026")).rejects.toThrow(/only the 20200117222855 snapshot/);
  });

  it("fails when the archive answers with an error", async () => {
    await expect(tanosSource((async () => respond("no", 503)) as typeof fetch, () => {}).download(SNAPSHOT)).rejects.toThrow(/503/);
  });
});
