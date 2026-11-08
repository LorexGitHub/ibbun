import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { unidicSource } from "./index.ts";
import { parseLexicon } from "./parse.ts";
import { openRemoteZip } from "./remote-zip.ts";

/** A `lex.csv` row of the 33-column layout: only the columns the parser reads, the rest `*`. */
const row = (c: { surface: string; cost?: number; pos2?: string; orthBase?: string; kana: string; kanaBase?: string; aType?: string }) => {
  const f = Array<string>(33).fill("*");
  f[0] = c.surface;
  f[3] = String(c.cost ?? 5000);
  f[5] = c.pos2 ?? "普通名詞";
  f[14] = c.orthBase ?? c.surface;
  f[24] = c.kana;
  f[25] = c.kanaBase ?? c.kana;
  f[28] = c.aType?.includes(",") ? `"${c.aType}"` : (c.aType ?? "*");
  return f.join(",");
};
const csv = (...rows: string[]) => new TextEncoder().encode(rows.join("\n") + "\n");

describe("parseLexicon", () => {
  it("makes a record of each dictionary-form lexeme with an accent, keyed by orthographic base and hiragana kana base", () => {
    expect(parseLexicon(csv(row({ surface: "食べる", kana: "タベル", aType: "2" }), row({ surface: "コーヒー", kana: "コーヒー", aType: "3" })))).toEqual([
      { key: "食べる\tたべる", form: "食べる", reading: "たべる", pitchAccent: [2] },
      { key: "コーヒー\tこーひー", form: "コーヒー", reading: "こーひー", pitchAccent: [3] },
    ]);
  });

  it("keeps every accent a lexeme lists, most common first", () => {
    expect(parseLexicon(csv(row({ surface: "日本", kana: "ニホン", aType: "3,0" })))[0]!.pitchAccent).toEqual([3, 0]);
  });

  it("skips inflected rows, rows with no accent, rows with an accent that is not a number list and rows of another shape", () => {
    const rows = [
      row({ surface: "食べ", orthBase: "食べる", kana: "タベ", kanaBase: "タベル", aType: "2" }),
      row({ surface: "犬", kana: "イヌ" }),
      row({ surface: "猫", kana: "ネコ", aType: "1,*" }),
      `",",${row({ surface: "x", kana: "エックス", aType: "0" })}`,
      "short,row",
      row({ surface: "雨", kana: "アメ", aType: "1" }),
    ];
    expect(parseLexicon(csv(...rows)).map((r) => r.key)).toEqual(["雨\tあめ"]);
  });

  it("skips a row on each of its own faults: an extra column, an inflected surface, a different kana base", () => {
    const plain = row({ surface: "雨", kana: "アメ", aType: "1" });
    const rows = [
      `${plain},*`,
      row({ surface: "雨", orthBase: "飴", kana: "アメ", aType: "1" }),
      row({ surface: "雨", kana: "アメ", kanaBase: "アマ", aType: "1" }),
    ];
    expect(parseLexicon(csv(...rows, plain)).map((r) => r.key)).toEqual(["雨\tあめ"]);
    expect(parseLexicon(csv(...rows, plain))).toHaveLength(1);
  });

  it("takes a common word's accent before a surname's, and the cheaper entry before the dearer", () => {
    const lexicon = csv(
      row({ surface: "橋", kana: "ハシ", pos2: "固有名詞", aType: "1", cost: 1000 }),
      row({ surface: "橋", kana: "ハシ", aType: "2", cost: 9000 }),
      row({ surface: "橋", kana: "ハシ", aType: "0", cost: 3000 }),
      row({ surface: "橋", kana: "ハシ", aType: "2,0", cost: 8000 }),
    );
    expect(parseLexicon(lexicon)).toEqual([{ key: "橋\tはし", form: "橋", reading: "はし", pitchAccent: [0, 2] }]);
  });

  it("falls back to a name when the lexeme is only a name", () => {
    expect(parseLexicon(csv(row({ surface: "田中", kana: "タナカ", pos2: "固有名詞", aType: "0" })))[0]!.pitchAccent).toEqual([0]);
  });

  it("tolerates CRLF line ends and a last line with no newline", () => {
    const text = `${row({ surface: "雨", kana: "アメ", aType: "1" })}\r\n${row({ surface: "飴", kana: "アメ", aType: "0" })}`;
    expect(parseLexicon(new TextEncoder().encode(text)).map((r) => r.pitchAccent)).toEqual([[1], [0]]);
  });

  it("fails when no row is usable, so a wrong file never empties the accents", () => {
    expect(() => parseLexicon(csv("a,b,c"))).toThrow(/33-column/);
  });
});

type Member = { name: string; data: Uint8Array };

type ZipOptions = {
  /** Write each local header offset as a Zip64 extra field, as UniDic's full zip does. */
  wideOffsets?: boolean;
  /** Write sizes and offset all as Zip64 values. */
  wideAll?: boolean;
  /** Put an unrelated extra field (extended timestamp) before the Zip64 one, and give every local header an extra field. */
  noise?: boolean;
  comment?: string;
  /** Store the member without deflating it. */
  stored?: boolean;
};

/** A zip of deflated members. */
const zip = (members: Member[], options: ZipOptions = {}) => {
  const { wideOffsets = false, wideAll = false, noise = false, comment = "", stored = false } = options;
  const u16 = (n: number) => Buffer.from([n & 255, n >> 8]);
  const u32 = (n: number) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
  const u64 = (n: number) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(n));
    return b;
  };
  const timestamp = Buffer.concat([u16(0x5455), u16(5), Buffer.from([1, 0, 0, 0, 0])]);
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of members) {
    const [n, packed] = [Buffer.from(name), stored ? Buffer.from(data) : deflateRawSync(data)];
    const localExtra = noise ? timestamp : Buffer.alloc(0);
    const header = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(stored ? 0 : 8), u32(0), u32(0), u32(packed.length), u32(data.length), u16(n.length), u16(localExtra.length), n, localExtra]);
    const wide = wideOffsets || wideAll;
    const zip64 = wideAll ? Buffer.concat([u16(1), u16(24), u64(data.length), u64(packed.length), u64(offset)]) : wide ? Buffer.concat([u16(1), u16(8), u64(offset)]) : Buffer.alloc(0);
    const extra = Buffer.concat([noise ? timestamp : Buffer.alloc(0), zip64]);
    const size = (n: number) => u32(wideAll ? 0xffffffff : n);
    const entryComment = Buffer.from(noise ? "note" : "");
    central.push(
      Buffer.concat([u32(0x02014b50), u16(45), u16(20), u16(0), u16(stored ? 0 : 8), u32(0), u32(0), size(packed.length), size(data.length), u16(n.length), u16(extra.length), u16(entryComment.length), u16(0), u16(0), u32(0), u32(wide ? 0xffffffff : offset), n, extra, entryComment]),
    );
    local.push(header, packed);
    offset += header.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(members.length), u16(members.length), u32(directory.length), u32(offset), u16(comment.length), Buffer.from(comment)]);
  return new Uint8Array(Buffer.concat([...local, directory, end]));
};

/** A server that answers range requests from `files` by URL, and everything else with 200. `log` takes each request's range. */
const server = (files: Record<string, Uint8Array | string>, log: string[] = []) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = files[String(input)];
    if (body === undefined) return new Response("nope", { status: 404 });
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const spec = new Headers(init?.headers).get("range");
    if (!spec) return new Response(new Uint8Array(bytes));
    log.push(spec);
    const [, from = "", to = ""] = /^bytes=(\d*)-(\d*)$/.exec(spec) ?? [];
    const [start, end] = from === "" ? [Math.max(0, bytes.length - Number(to)), bytes.length - 1] : [Number(from), Math.min(Number(to), bytes.length - 1)];
    return new Response(new Uint8Array(bytes.slice(start, end + 1)), { status: 206 });
  }) as typeof fetch;

const bytes = (text: string) => new TextEncoder().encode(text);
const members = [
  { name: "README.md", data: bytes("readme") },
  { name: "lex.csv", data: csv(row({ surface: "食べる", kana: "タベル", aType: "2" })) },
  { name: "license/BSD", data: bytes("Copyright (c) 2023 National Institute for Japanese Language and Linguistics") },
];

describe("openRemoteZip", () => {
  const url = "https://example.test/a.zip";
  const open = (archive: Uint8Array, log: string[] = []) => openRemoteZip(server({ [url]: archive }, log), url);
  const licence = "Copyright (c) 2023 National Institute for Japanese Language and Linguistics";
  const readLicence = async (archive: Uint8Array) => new TextDecoder().decode(await (await open(archive)).read("license/BSD"));

  it("reads one member by range request without fetching the others", async () => {
    const log: string[] = [];
    const archive = await open(zip(members), log);
    expect(new TextDecoder().decode(await archive.read("license/BSD"))).toBe(licence);
    expect(log).toHaveLength(4);
    expect(log[0]).toMatch(/^bytes=-/);
  });

  it("returns exactly the deflated bytes of a member", async () => {
    const archive = await open(zip(members, { noise: true }));
    expect(Buffer.from(await archive.deflated("lex.csv"))).toEqual(deflateRawSync(members[1]!.data));
  });

  for (const [what, options] of [
    ["Zip64 offsets", { wideOffsets: true }],
    ["Zip64 sizes and offsets", { wideAll: true }],
    ["unrelated extra fields before the Zip64 one, and in local headers", { wideOffsets: true, noise: true }],
    ["a zip comment", { comment: "made by test" }],
  ] satisfies [string, ZipOptions][]) {
    it(`reads a zip with ${what}`, async () => {
      expect(await readLicence(zip(members, options))).toBe(licence);
    });
  }

  it("fails on a member the zip does not hold, one that is not deflated, and a server that ignores range requests", async () => {
    await expect((await open(zip(members))).read("nope")).rejects.toThrow(/holds no nope/);
    await expect((await open(zip(members, { stored: true }))).read("license/BSD")).rejects.toThrow(/not deflated \(method 0\)/);
    const ignoring = (async () => new Response(new Uint8Array(zip(members)))) as typeof fetch;
    await expect(openRemoteZip(ignoring, url)).rejects.toThrow(/answered 200 to a range request/);
  });

  it("fails on a damaged archive: no end-of-directory record, a Zip64 directory, a damaged entry, missing Zip64 values, a missing local header", async () => {
    const good = zip(members);
    await expect(open(new Uint8Array(100))).rejects.toThrow(/no zip end-of-directory/);

    const wideDirectory = Uint8Array.from(good);
    wideDirectory.set([255, 255, 255, 255], good.length - 22 + 12);
    await expect(open(wideDirectory)).rejects.toThrow(/Zip64 directory/);

    const directoryAt = Buffer.from(good).indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
    const damaged = Uint8Array.from(good);
    damaged[directoryAt] = 0;
    await expect(open(damaged)).rejects.toThrow(/central directory is damaged/);

    const noValues = Uint8Array.from(good);
    noValues.set([255, 255, 255, 255], directoryAt + 42);
    await expect(open(noValues)).rejects.toThrow(/needs Zip64 values/);

    const noLocal = Uint8Array.from(good);
    noLocal[0] = 0;
    await expect((await open(noLocal)).read("README.md")).rejects.toThrow(/no local header/);
  });
});

describe("unidicSource", () => {
  const page = '<a href="/unidic_archive/2512/unidic-cwj-202512.zip">cwj</a> <a href="/unidic_archive/2512/unidic-csj-202512.zip">csj</a>';
  const files = {
    "https://clrd.ninjal.ac.jp/unidic/download.html": page,
    "https://clrd.ninjal.ac.jp/unidic_archive/2512/unidic-cwj-202512_full.zip": zip(members, { wideOffsets: true }),
  };

  it("names the newest cwj release by its stamp", async () => {
    expect(await unidicSource(server(files)).latest()).toBe("202512");
    await expect(unidicSource(server({ ...files, "https://clrd.ninjal.ac.jp/unidic/download.html": "<p>nothing</p>" })).latest()).rejects.toThrow(/links no unidic-cwj zip/);
  });

  it("downloads lex.csv and the BSD licence from the full zip, and parses the accents out of what it kept", async () => {
    const source = unidicSource(server(files));
    const raw = await source.download("202512");
    expect(raw.map((f) => f.name)).toEqual(["lex.csv.deflate", "BSD"]);
    expect(new TextDecoder().decode(raw[1]!.bytes)).toMatch(/National Institute/);
    expect(await source.parse(raw)).toEqual([{ key: "食べる\tたべる", form: "食べる", reading: "たべる", pitchAccent: [2] }]);
  });

  it("fails to parse raw files without the lexicon", () => {
    expect(() => unidicSource(server(files)).parse([])).toThrow(/no lex.csv.deflate/);
  });
});
