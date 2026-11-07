import { describe, expect, it } from "vitest";
import { yomitanSource } from "./index.ts";
import { parseCsv } from "./csv.ts";
import { parseLevels } from "./parse.ts";

const HEADER = "jmdict_seq,kana,kanji,waller_definition";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n") + "\n";
const lists = (by: Partial<Record<"n5" | "n4" | "n3" | "n2" | "n1", string[]>>) =>
  (["n1", "n2", "n3", "n4", "n5"] as const).map((n) => ({ name: `${n}.csv`, text: csv(...(by[n] ?? [])) }));

const parse = (by: Parameters<typeof lists>[0]) => {
  const lines: string[] = [];
  return { records: parseLevels(lists(by), (l) => lines.push(l)), lines };
};

describe("parseCsv", () => {
  it("reads quoted fields with commas, doubled quotes and line breaks, and either line ending", () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\n"x\ny",,z\n')).toEqual([["a", "b,c", 'say "hi"'], ["x\ny", "", "z"]]);
  });
  it("keeps a last row with no final newline and drops blank lines", () => {
    expect(parseCsv("a,b\n\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("parseLevels", () => {
  it("gives each ent_seq the level of the list it is on", () => {
    const { records, lines } = parse({ n5: ['1198180,あう,会う,"to meet, to see"'], n1: ["1381380,あお,青,blue"] });
    expect(records).toEqual([{ key: "1198180", level: "N5" }, { key: "1381380", level: "N1" }]);
    expect(lines).toEqual([]);
  });

  it("keeps the easiest level of a Word on two lists, and reports the collision", () => {
    const { records, lines } = parse({ n3: ["5,かう,買う,buy"], n5: ["5,かう,買う,buy"], n1: ["5,かう,買う,buy"] });
    expect(records).toEqual([{ key: "5", level: "N5" }]);
    expect(lines).toEqual(["ent_seq 5 (買う (N3)) is also listed at N5: kept N5", "ent_seq 5 (買う (N1)) is also listed at N5: kept N5"]);
  });

  it("does not call a repeat on the same list a collision", () => {
    const { records, lines } = parse({ n4: ["7,ねる,寝る,sleep", "7,ねる,寝る,sleep"] });
    expect(records).toEqual([{ key: "7", level: "N4" }]);
    expect(lines).toEqual([]);
  });

  it("skips and reports a row with no match or several, naming the kana when it has no kanji", () => {
    const { records, lines } = parse({ n1: [",い,依,depending on", "12 34,ああ,,oh", "x,ええ,,eh"] });
    expect(records).toEqual([]);
    expect(lines).toEqual(["依 (N1) has no JMdict match: skipped", "ああ (N1) has several JMdict matches (12 34): skipped", "ええ (N1) has several JMdict matches (x): skipped"]);
  });

  it("fails the whole run on a missing file or a missing column", () => {
    expect(() => parseLevels(lists({}).slice(1), () => {})).toThrow(/no n1\.csv/);
    expect(() => parseLevels([...lists({}).slice(0, 4), { name: "n5.csv", text: "a,b\n1,2\n" }], () => {})).toThrow(/n5\.csv has no jmdict_seq/);
  });
});

describe("yomitanSource", () => {
  const respond = (body: string, status = 200) => new Response(body, { status });
  const fetching = (calls: string[]) => (async (url: string | URL | Request) => {
    calls.push(String(url));
    return String(url).includes("api.github.com") ? respond(JSON.stringify({ tag_name: "2025.08.01.0", assets: [] })) : respond(csv("1,あ,亜,x"));
  }) as typeof fetch;

  it("takes the release tag as the version and downloads the five CSVs at that tag", async () => {
    const calls: string[] = [];
    const source = yomitanSource(fetching(calls), () => {});
    expect(await source.latest()).toBe("2025.08.01.0");
    const files = await source.download("2025.08.01.0");
    expect(files.map((f) => f.name)).toEqual(["n5.csv", "n4.csv", "n3.csv", "n2.csv", "n1.csv"]);
    expect(calls.slice(1)).toEqual(["n5", "n4", "n3", "n2", "n1"].map((n) => `https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/2025.08.01.0/original_data/${n}.csv`));
    expect(source.parse(files)).toEqual([{ key: "1", level: "N5" }]);
  });

  it("fails when upstream answers with an error", async () => {
    const source = yomitanSource((async () => respond("no", 503)) as typeof fetch, () => {});
    await expect(source.latest()).rejects.toThrow(/503/);
    await expect(source.download("v")).rejects.toThrow(/503/);
  });
});
