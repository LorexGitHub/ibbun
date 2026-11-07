import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { directoryRawFiles, memoryRawFiles, RAW_RUNS_KEPT, type RawFiles } from "./raw-files.ts";

const file = (name: string, text: string) => ({ name, bytes: new TextEncoder().encode(text) });
const text = (files: { bytes: Uint8Array }[] | null) => files?.map((f) => new TextDecoder().decode(f.bytes));

const rawFilesContract = (make: () => Promise<{ raw: RawFiles; versions: () => Promise<string[]>; age: (version: string, daysAgo: number) => Promise<void> }>) => {
  it("reads back the files it kept, and null for a version it never saw", async () => {
    const { raw } = await make();
    await raw.keep("jmdict", "3.6.2+1", [file("a.json", "alpha"), file("b.json", "beta")]);
    expect(text(await raw.read("jmdict", "3.6.2+1"))?.sort()).toEqual(["alpha", "beta"]);
    expect(await raw.read("jmdict", "9.9.9")).toBeNull();
    expect(await raw.read("kanjidic", "3.6.2+1")).toBeNull();
  });

  it(`keeps the raw files of the last ${RAW_RUNS_KEPT} runs per dataset and deletes older ones`, async () => {
    const { raw, versions, age } = await make();
    for (const [i, version] of ["v1", "v2", "v3", "v4"].entries()) {
      await raw.keep("jmdict", version, [file("a.json", version)]);
      await age(version, 10 - i);
    }
    await raw.keep("kanjidic", "k1", [file("a.json", "k1")]);
    expect((await versions()).sort()).toEqual(["v2", "v3", "v4"].sort());
    expect(await raw.read("jmdict", "v1")).toBeNull();
    expect(text(await raw.read("kanjidic", "k1"))).toEqual(["k1"]);
  });

  it("replaces the files of a version kept twice", async () => {
    const { raw } = await make();
    await raw.keep("jmdict", "v1", [file("a.json", "old"), file("b.json", "gone")]);
    await raw.keep("jmdict", "v1", [file("a.json", "new")]);
    expect(text(await raw.read("jmdict", "v1"))).toEqual(["new"]);
  });
};

describe("raw files on a directory", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "raw-"));
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  rawFilesContract(async () => ({
    raw: directoryRawFiles(root),
    versions: async () => (await readdir(join(root, "jmdict"))).map(decodeURIComponent),
    age: async (version, daysAgo) => {
      const when = new Date(Date.now() - daysAgo * 86_400_000);
      await utimes(join(root, "jmdict", encodeURIComponent(version)), when, when);
    },
  }));

  it("keeps a version with characters a folder name cannot hold", async () => {
    const raw = directoryRawFiles(root);
    await raw.keep("jmdict", "3.6.2+2026/11?02", [file("a.json", "x")]);
    expect(text(await raw.read("jmdict", "3.6.2+2026/11?02"))).toEqual(["x"]);
  });
});

describe("raw files in memory", () => {
  rawFilesContract(async () => {
    const raw = memoryRawFiles();
    return { raw, versions: async () => raw.versions("jmdict"), age: async () => undefined };
  });
});
