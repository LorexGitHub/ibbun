import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateContentGraph, n5Fixture, seedContentGraph } from "@ibbun/content-graph/testing";
import { createDb, type Db } from "@ibbun/db";
import { startTestPostgres, type TestPostgres } from "@ibbun/db/testing";
import { NotFound, type S3Client } from "@aws-sdk/client-s3";
import { required } from "../sources/grammar-seed/connect.ts";
import { copyContent, publishAudio, s3AudioTarget, type AudioTarget } from "./publish.ts";

const memoryTarget = () => {
  const files = new Map<string, Uint8Array>();
  const writes: string[] = [];
  const target: AudioTarget = {
    has: async (key) => files.has(key),
    put: async (key, audio) => {
      writes.push(key);
      files.set(key, audio);
    },
  };
  return { target, files, writes };
};

describe("publishing local content to a stage", () => {
  let sourcePg: TestPostgres, targetPg: TestPostgres;
  let source: Db, target: Db;
  beforeAll(async () => {
    [sourcePg, targetPg] = await Promise.all([startTestPostgres(), startTestPostgres()]);
    source = createDb(sourcePg.url, { max: 1, iamRegion: "" });
    target = createDb(targetPg.url, { max: 1, iamRegion: "" });
    await Promise.all([migrateContentGraph(source), migrateContentGraph(target)]);
    await seedContentGraph(source, n5Fixture().graph);
    await source.$client.query("UPDATE content_graph.sentence SET audio_key = 'audio/' || id WHERE approval = 'approved'");
    await source.$client.query("UPDATE content_graph.sentence SET audio_key = 'audio/draft' WHERE approval <> 'approved'");
  });
  afterAll(async () => {
    await Promise.all([source.$client.end(), target.$client.end()]);
    await Promise.all([sourcePg.stop(), targetPg.stop()]);
  });

  const count = async (db: Db, sql: string) => Number((await db.$client.query(sql)).rows[0].n);

  it("copies approved records and leaves drafts behind", async () => {
    const report = await copyContent(source.$client, target.$client);
    expect(report.tables.reduce((n, t) => n + t.changed, 0)).toBeGreaterThan(0);
    const items = "SELECT count(*) AS n FROM content_graph.study_item";
    expect(await count(target, `${items} WHERE approval = 'approved' AND NOT retired`)).toBeGreaterThan(0);
    expect(await count(target, `${items} WHERE approval <> 'approved' OR retired`)).toBe(0);
    expect(await count(target, "SELECT count(*) AS n FROM content_graph.sentence WHERE approval <> 'approved'")).toBe(0);
    expect(await count(target, "SELECT count(*) AS n FROM content_graph.override")).toBe(0);
    const approved = (await source.$client.query("SELECT audio_key FROM content_graph.sentence WHERE approval = 'approved' AND NOT retired ORDER BY 1")).rows;
    expect(report.audioKeys.length).toBeGreaterThan(0);
    expect(report.audioKeys).toEqual(expect.arrayContaining([approved[0].audio_key]));
    expect(report.audioKeys).not.toContain("audio/draft");
  });

  it("changes nothing on a second run, and picks up an edit on the third", async () => {
    const again = await copyContent(source.$client, target.$client);
    expect(again.tables.filter((t) => t.changed > 0)).toEqual([]);
    expect(again.tables.find((t) => t.table === "sentence")?.copied).toBeGreaterThan(0);

    await source.$client.query("UPDATE content_graph.sentence SET translation_en = 'edited' WHERE approval = 'approved' AND translation_en IS NOT NULL");
    const edited = await copyContent(source.$client, target.$client);
    expect(edited.tables.filter((t) => t.changed > 0).map((t) => t.table)).toEqual(["sentence"]);
    expect(await count(target, "SELECT count(*) AS n FROM content_graph.sentence WHERE translation_en = 'edited'")).toBeGreaterThan(0);
  });

  it("uploads audio once, and skips files the bucket already has", async () => {
    const { target: bucket, files, writes } = memoryTarget();
    const from = async (key: string) => (key === "gone" ? null : new TextEncoder().encode(key));
    expect(await publishAudio(["a", "b", "gone"], from, bucket)).toEqual({ uploaded: 2, unchanged: 0, missing: ["gone"] });
    expect(await publishAudio(["a", "b"], from, bucket)).toEqual({ uploaded: 0, unchanged: 2, missing: [] });
    expect(writes).toEqual(["a", "b"]);
    expect([...files.keys()]).toEqual(["a", "b"]);
  });

  it("keeps audio at the bucket prefix, as immutable audio/ogg, and reads a 404 as absent", async () => {
    const sent: { Bucket?: string; Key?: string; ContentType?: string; CacheControl?: string }[] = [];
    const present = new Set(["audio/here"]);
    const client = {
      send: async (command: { constructor: { name: string }; input: { Key: string } }) => {
        sent.push(command.input);
        if (command.constructor.name === "HeadObjectCommand" && !present.has(command.input.Key)) throw new NotFound({ message: "", $metadata: {} });
        return {};
      },
    } as unknown as S3Client;
    const store = s3AudioTarget(client, "s3://bucket/audio/");
    expect(await store.has("here")).toBe(true);
    expect(await store.has("new")).toBe(false);
    await store.put("new", new Uint8Array([1]));
    expect(sent.at(-1)).toMatchObject({ Bucket: "bucket", Key: "audio/new", ContentType: "audio/ogg", CacheControl: "public, max-age=31536000, immutable" });
    const broken = s3AudioTarget({ send: async () => Promise.reject(new Error("denied")) } as unknown as S3Client, "s3://bucket/");
    await expect(broken.has("x")).rejects.toThrow("denied");
  });

  it("names the missing setting", () => {
    expect(required({ A: "1" }, "A")).toBe("1");
    expect(() => required({}, "TARGET_DATABASE_URL")).toThrow("TARGET_DATABASE_URL is not set");
  });
});
