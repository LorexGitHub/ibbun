import type { Clock } from "../authoring.ts";
import { rules } from "../authoring.ts";
import type { Store } from "../store.ts";
import { kanjidic, tatoeba } from "./datasets.ts";
import { jmdict } from "./jmdict.ts";
import { tripped } from "./match.ts";
import { runContext, type RunCtx } from "./run.ts";
import { DEFAULT_BREAKER, type Counts, type Dataset, type Records, type Run, type SnapshotOptions, type SnapshotReport } from "./types.ts";

type Rules<R> = {
  add: (ctx: RunCtx, record: R) => Promise<string>;
  change: (ctx: RunCtx, id: string, record: R) => Promise<boolean>;
  retire: (ctx: RunCtx, id: string, surviving: R[], idOf: (key: string) => string) => Promise<void>;
};

const RULES: { [D in Dataset]: Rules<Records[D]> } = { jmdict, kanjidic, tatoeba };

/** Thrown inside the transaction so a tripped run rolls back everything it wrote. */
class Tripped extends Error {
  readonly counts: Counts;
  readonly reasons: string[];
  constructor(counts: Counts, reasons: string[]) {
    super("breaker tripped");
    this.counts = counts;
    this.reasons = reasons;
  }
}

const isLive = async (ctx: RunCtx, dataset: Dataset, id: string) => {
  const [row] = dataset === "tatoeba" ? await ctx.tx.rows("sentence", { id }) : await ctx.tx.rows("studyItem", { id });
  return row !== undefined && !row.retired;
};

/** New keys, changed keys, then gone keys, so successor detection sees every surviving entry. */
const applyRecords = async <D extends Dataset>(ctx: RunCtx, dataset: D, records: Records[D][], ids: Map<string, string>) => {
  const rule = RULES[dataset] as Rules<Records[D]>;
  const gone = [...ids].filter(([key]) => !records.some((r) => r.key === key));
  for (const record of records) {
    const id = ids.get(record.key);
    if (id === undefined) {
      ids.set(record.key, await rule.add(ctx, record));
      ctx.counts.added++;
    } else if (await rule.change(ctx, id, record)) ctx.counts.changed++;
  }
  for (const [, id] of gone) if (await isLive(ctx, dataset, id)) await rule.retire(ctx, id, records, (key) => ids.get(key)!);
  await ctx.settleSuspensions();
};

const run = async <D extends Dataset>(tx: Store, clock: Clock, dataset: D, importRunId: string, info: Run, records: Records[D][], options: SnapshotOptions) => {
  await tx.insert("importRun", [{ id: importRunId, dataset, ...info, status: "applying", counts: {}, appliedAt: null }]);
  const ctx = runContext(tx, clock, dataset, importRunId, options.senseThreshold ?? 0.5);
  const ids = new Map((await tx.rows("sourceKey", { dataset })).map((k) => [k.upstreamKey, k.recordId]));
  const total = ids.size;
  await applyRecords(ctx, dataset, records, ids);
  const reasons = options.release ? [] : tripped(ctx.counts, total, options.breaker ?? DEFAULT_BREAKER);
  if (reasons.length) throw new Tripped(ctx.counts, reasons);
  await tx.update("importRun", { id: importRunId }, { status: "applied", counts: ctx.counts, appliedAt: clock.now() });
  return ctx.counts;
};

/**
 * Applies one dataset's full normalised snapshot in one transaction (import-pipeline.md#one-import-run).
 * A rerun of an applied upstream version changes nothing. A run that trips the circuit breaker applies
 * nothing: it is recorded as `breaker tripped` and queued for the supervisor.
 */
export const applySnapshot = async <D extends Dataset>(
  s: Store,
  clock: Clock,
  dataset: D,
  info: Run,
  records: Records[D][],
  options: SnapshotOptions = {},
): Promise<SnapshotReport> => {
  const [done] = await s.rows("importRun", { dataset, upstreamVersion: info.upstreamVersion, status: "applied" });
  if (done) return { importRunId: done.id, status: "unchanged", counts: done.counts as Counts, tripped: [] };
  const importRunId = clock.newId();
  try {
    const counts = await s.atomically((tx) => run(tx, clock, dataset, importRunId, info, records, options));
    return { importRunId, status: "applied", counts, tripped: [] };
  } catch (error) {
    if (!(error instanceof Tripped)) throw error;
    await s.atomically(async (tx) => {
      await tx.insert("importRun", [{ id: importRunId, dataset, ...info, status: "breaker tripped", counts: error.counts, appliedAt: null }]);
      await rules(tx, clock).enqueue({ reason: "breaker tripped", importRunId, detail: { reasons: error.reasons, counts: error.counts } });
    });
    return { importRunId, status: "breaker tripped", counts: error.counts, tripped: error.reasons };
  }
};
