import { and, eq, inArray, sql } from "drizzle-orm";
import type { Dataset, Records } from "@mojibun/content-graph/authoring";
import type { Db } from "@mojibun/db";
import { runDiff, snapshot, snapshotRecord } from "../db/schema.ts";
import type { Diff } from "./diff.ts";

export type Counted = { added: number; changed: number; gone: number };

export type Changes<D extends Dataset> = { upserts: Records[D][]; deletes: string[] };

/** The latest normalised snapshot per dataset, which the next run diffs against, and each run's diff counts. */
export interface Snapshots {
  /** The upstream version the latest snapshot of `dataset` holds, without reading its records. */
  version(dataset: Dataset): Promise<string | null>;
  latest<D extends Dataset>(dataset: D): Promise<{ upstreamVersion: string; records: Records[D][] } | null>;
  /** Moves the latest snapshot of `dataset` to `upstreamVersion` by writing only what changed. */
  apply<D extends Dataset>(dataset: D, upstreamVersion: string, changes: Changes<D>): Promise<void>;
  saveDiff(importRunId: string, diff: Diff): Promise<void>;
  diffs(importRunIds: string[]): Promise<Map<string, Counted>>;
}

export const counted = (diff: Diff): Counted => ({ added: diff.added.length, changed: diff.changed.length, gone: diff.gone.length });

const CHUNK = 1000;

export const postgresSnapshots = (db: Db): Snapshots => ({
  async version(dataset) {
    const [head] = await db.select().from(snapshot).where(eq(snapshot.dataset, dataset));
    return head?.upstreamVersion ?? null;
  },

  async latest(dataset) {
    const [head] = await db.select().from(snapshot).where(eq(snapshot.dataset, dataset));
    if (!head) return null;
    const rows = await db.select().from(snapshotRecord).where(eq(snapshotRecord.dataset, dataset));
    return { upstreamVersion: head.upstreamVersion, records: rows.map((r) => r.record) as never };
  },

  apply: (dataset, upstreamVersion, changes) =>
    db.transaction(async (tx) => {
      if (changes.deletes.length) await tx.delete(snapshotRecord).where(and(eq(snapshotRecord.dataset, dataset), inArray(snapshotRecord.key, changes.deletes)));
      for (let at = 0; at < changes.upserts.length; at += CHUNK) {
        const rows = changes.upserts.slice(at, at + CHUNK).map((record) => ({ dataset, key: record.key, record }));
        await tx.insert(snapshotRecord).values(rows).onConflictDoUpdate({ target: [snapshotRecord.dataset, snapshotRecord.key], set: { record: sql`excluded.record` } });
      }
      await tx.insert(snapshot).values({ dataset, upstreamVersion }).onConflictDoUpdate({ target: snapshot.dataset, set: { upstreamVersion } });
    }),

  saveDiff: async (importRunId, diff) => {
    const counts = counted(diff);
    await db.insert(runDiff).values({ importRunId, ...counts }).onConflictDoUpdate({ target: runDiff.importRunId, set: counts });
  },

  diffs: async (importRunIds) => {
    if (!importRunIds.length) return new Map();
    const rows = await db.select().from(runDiff).where(inArray(runDiff.importRunId, importRunIds));
    return new Map(rows.map(({ importRunId, ...c }) => [importRunId, c]));
  },
});

export const memorySnapshots = (): Snapshots => {
  const heads = new Map<string, { upstreamVersion: string; records: Map<string, { key: string }> }>();
  const diffs = new Map<string, Counted>();
  return {
    version: async (dataset) => heads.get(dataset)?.upstreamVersion ?? null,
    latest: async (dataset) => {
      const head = heads.get(dataset);
      return head ? ({ upstreamVersion: head.upstreamVersion, records: structuredClone([...head.records.values()]) } as never) : null;
    },
    apply: async (dataset, upstreamVersion, { upserts, deletes }) => {
      const records = heads.get(dataset)?.records ?? new Map();
      for (const key of deletes) records.delete(key);
      for (const record of upserts) records.set(record.key, structuredClone(record));
      heads.set(dataset, { upstreamVersion, records });
    },
    saveDiff: async (importRunId, diff) => void diffs.set(importRunId, counted(diff)),
    diffs: async (ids) => new Map(ids.flatMap((id) => (diffs.has(id) ? [[id, diffs.get(id)!] as const] : []))),
  };
};
