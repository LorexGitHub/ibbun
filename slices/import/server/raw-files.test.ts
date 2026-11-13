import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { CreateBucketCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { directoryRawFiles, memoryRawFiles, RAW_RUNS_KEPT, rawFilesAt, s3RawFiles, type RawFiles } from "./raw-files.ts";

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

// Runs against Compose's S3 (`docker compose up -d s3`) when TEST_S3_ENDPOINT is set, as in CI.
const endpoint = process.env.TEST_S3_ENDPOINT;
describe.runIf(endpoint)("raw files in S3", () => {
  const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "test", secretAccessKey: "test" } });
  // One bucket for every run: SeaweedFS gives each bucket its own volumes and fails once they run out. Each test takes a fresh prefix.
  const bucket = "ibbun-test-raw";
  beforeAll(() => client.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => {}));
  // From the objects, not CommonPrefixes: SeaweedFS lists a prefix whose objects were all deleted.
  const versionsIn = async (prefix: string) => {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}jmdict/` }));
    const folders = (page.Contents ?? []).map((o) => o.Key!.slice(`${prefix}jmdict/`.length).split("/")).filter((parts) => parts.length > 1);
    return [...new Set(folders.map(([folder]) => decodeURIComponent(folder!)))];
  };

  rawFilesContract(async () => {
    const prefix = `${randomUUID()}/`;
    return { raw: s3RawFiles(client, bucket, prefix), versions: () => versionsIn(prefix), age: async () => {} };
  });

  it("is what s3://bucket/prefix in IMPORT_RAW_DIR names", async () => {
    const prefix = `${randomUUID()}/raw/`;
    vi.stubEnv("AWS_ENDPOINT_URL_S3", endpoint);
    vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test");
    try {
      await rawFilesAt(`s3://${bucket}/${prefix}`).keep("jmdict", "3.6.2+2026/11?02", [file("a.json", "x")]);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(text(await s3RawFiles(client, bucket, prefix).read("jmdict", "3.6.2+2026/11?02"))).toEqual(["x"]);
    expect(await versionsIn(prefix)).toEqual(["3.6.2+2026/11?02"]);
  });
});
