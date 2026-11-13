import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { RawFile } from "./source.ts";

/** Raw files of the newest runs per dataset stay on disk so a run can be replayed (import-pipeline.md#what-is-kept). */
export const RAW_RUNS_KEPT = 3;

export interface RawFiles {
  /** The files kept for `version`, or null if they are not on disk. */
  read(dataset: string, version: string): Promise<RawFile[] | null>;
  /** Writes the files of `version`, then deletes the raw files of all but the newest runs. */
  keep(dataset: string, version: string, files: RawFile[]): Promise<void>;
}

/** Version strings come from upstream, so they are made safe to use as a folder name. */
const folder = (version: string) => encodeURIComponent(version);

export const directoryRawFiles = (root: string): RawFiles => ({
  async read(dataset, version) {
    const dir = join(root, dataset, folder(version));
    const names = await readdir(dir).catch(() => null);
    if (!names?.length) return null;
    return Promise.all(names.map(async (name) => ({ name, bytes: await readFile(join(dir, name)) })));
  },

  async keep(dataset, version, files) {
    const dir = join(root, dataset, folder(version));
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const file of files) await writeFile(join(dir, file.name), file.bytes);
    const parent = join(root, dataset);
    const runs = await Promise.all(
      (await readdir(parent)).map(async (name) => ({ name, at: (await stat(join(parent, name))).mtimeMs })),
    );
    const old = runs.sort((a, b) => b.at - a.at || b.name.localeCompare(a.name)).slice(RAW_RUNS_KEPT);
    for (const { name } of old) await rm(join(parent, name), { recursive: true, force: true });
  },
});

/**
 * Raw files in a bucket under `prefix`: `<dataset>/<version>/<name>`, plus `<dataset>/runs.json`, the kept versions oldest first.
 * S3 has no folder mtime to order runs by, so the list is the order.
 */
export const s3RawFiles = (client: S3Client, bucket: string, prefix: string): RawFiles => {
  const runsKey = (dataset: string) => `${prefix}${dataset}/runs.json`;
  const runPrefix = (dataset: string, version: string) => `${prefix}${dataset}/${folder(version)}/`;
  const keysUnder = async (Prefix: string) => {
    const keys: string[] = [];
    let ContinuationToken: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken }));
      keys.push(...(page.Contents ?? []).map((o) => o.Key!));
      ContinuationToken = page.NextContinuationToken;
    } while (ContinuationToken);
    return keys;
  };
  const remove = async (dataset: string, version: string) => {
    const keys = await keysUnder(runPrefix(dataset, version));
    if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
  };
  const runs = async (dataset: string): Promise<string[]> => {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: runsKey(dataset) })).catch((error) => {
      if (error instanceof NoSuchKey) return null;
      throw error;
    });
    return object ? JSON.parse(await object.Body!.transformToString()) : [];
  };
  const put = (Key: string, Body: Uint8Array | string) => client.send(new PutObjectCommand({ Bucket: bucket, Key, Body }));

  return {
    async read(dataset, version) {
      const at = runPrefix(dataset, version);
      const keys = await keysUnder(at);
      if (!keys.length) return null;
      return Promise.all(
        keys.map(async (Key) => {
          const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key }));
          return { name: Key.slice(at.length), bytes: await object.Body!.transformToByteArray() };
        }),
      );
    },

    async keep(dataset, version, files) {
      await remove(dataset, version);
      for (const file of files) await put(runPrefix(dataset, version) + file.name, file.bytes);
      const kept = [...(await runs(dataset)).filter((v) => v !== version), version];
      await put(runsKey(dataset), JSON.stringify(kept.slice(-RAW_RUNS_KEPT)));
      for (const old of kept.slice(0, -RAW_RUNS_KEPT)) await remove(dataset, old);
    },
  };
};

/** `IMPORT_RAW_DIR` is a directory, or `s3://bucket/prefix` on AWS. A local S3 such as Compose's needs `AWS_ENDPOINT_URL_S3`. */
export const rawFilesAt = (location: string): RawFiles => {
  if (!location.startsWith("s3://")) return directoryRawFiles(location);
  const url = new URL(location);
  return s3RawFiles(new S3Client({ region: process.env.AWS_REGION ?? "us-east-1", forcePathStyle: Boolean(process.env.AWS_ENDPOINT_URL_S3) }), url.hostname, url.pathname.slice(1));
};

/** Raw files held in memory, for tests of everything that uses them. */
export const memoryRawFiles = (): RawFiles & { versions(dataset: string): string[] } => {
  const kept = new Map<string, Map<string, RawFile[]>>();
  return {
    read: async (dataset, version) => kept.get(dataset)?.get(version) ?? null,
    keep: async (dataset, version, files) => {
      const runs = kept.get(dataset) ?? new Map<string, RawFile[]>();
      runs.delete(version);
      runs.set(version, files);
      for (const old of [...runs.keys()].slice(0, -RAW_RUNS_KEPT)) runs.delete(old);
      kept.set(dataset, runs);
    },
    versions: (dataset) => [...(kept.get(dataset)?.keys() ?? [])],
  };
};
