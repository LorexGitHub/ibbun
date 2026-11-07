import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
