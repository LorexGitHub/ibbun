import type { Authoring, Counts, Dataset, Records, SnapshotReport } from "@mojibun/content-graph/authoring";
import { diff, type Diff } from "./diff.ts";
import type { RawFiles } from "./raw-files.ts";
import { checksum, type Source } from "./source.ts";
import type { Snapshots } from "./snapshots.ts";

export type ImportDeps = { authoring: Authoring; snapshots: Snapshots; raw: RawFiles };

export type ImportOutcome = { upstreamVersion: string; report: SnapshotReport; diff: Diff };

const NOTHING: Diff = { added: [], changed: [], gone: [] };

/**
 * One Import Run: stage, diff, apply, report (import-pipeline.md#one-import-run). A rerun of an upstream version that
 * is already live, or already held by the breaker, changes nothing. If raw files for the version are still on the
 * volume, they are parsed again instead of downloaded, which is how a run is replayed. `release` applies a run the
 * circuit breaker held.
 */
export const runImport = async <D extends Dataset>(deps: ImportDeps, source: Source<D>, options: { release?: boolean } = {}): Promise<ImportOutcome> => {
  const { authoring, snapshots, raw } = deps;
  const { dataset } = source;
  const upstreamVersion = await source.latest();

  const [applied] = await authoring.rows("importRun", { dataset, upstreamVersion, status: "applied" });
  if (applied && (await snapshots.version(dataset)) === upstreamVersion) {
    return { upstreamVersion, report: { importRunId: applied.id, status: "unchanged", counts: applied.counts as Counts, tripped: [] }, diff: NOTHING };
  }

  const [held] = options.release ? [] : await authoring.rows("importRun", { dataset, upstreamVersion, status: "breaker tripped" });
  if (held) return { upstreamVersion, report: { importRunId: held.id, status: "breaker tripped", counts: held.counts as Counts, tripped: [] }, diff: NOTHING };

  const files = (await raw.read(dataset, upstreamVersion)) ?? (await source.download(upstreamVersion));
  await raw.keep(dataset, upstreamVersion, files);
  const records: Records[D][] = source.parse(files);

  const previous = (await snapshots.latest(dataset))?.records ?? [];
  const changes = diff(previous, records);
  const report = await authoring.applySnapshot(dataset, { upstreamVersion, checksum: checksum(files) }, records, options);

  if (report.status !== "breaker tripped") {
    const touched = new Set([...changes.added, ...changes.changed]);
    await snapshots.apply(dataset, upstreamVersion, { upserts: records.filter((r) => touched.has(r.key)), deletes: changes.gone });
  }
  if (report.status !== "unchanged") await snapshots.saveDiff(report.importRunId, changes);
  return { upstreamVersion, report, diff: changes };
};
