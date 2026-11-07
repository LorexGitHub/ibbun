import { z } from "zod";

/** One Import Run as the report screen shows it (import-pipeline.md#one-import-run, step 4). */
export const RunReport = z.object({
  id: z.uuid(),
  dataset: z.string(),
  upstreamVersion: z.string(),
  status: z.string(),
  /** When the run went live; null for a run the circuit breaker holds. */
  appliedAt: z.string().nullable(),
  /** What `applySnapshot()` counted: added, changed, retired, superseded, overrides gone Stale or Orphaned, Examples redrafted, Suspended. */
  counts: z.record(z.string(), z.number()),
  /** Keys added, changed and gone against the previous snapshot. Null for a run that left no diff. */
  diff: z.object({ added: z.number(), changed: z.number(), gone: z.number() }).nullable(),
  /** The Content Approval queue, filtered to this run. */
  queuePath: z.string(),
});
export type RunReport = z.infer<typeof RunReport>;

export const RunsResponse = z.object({ runs: z.array(RunReport) });
export type RunsResponse = z.infer<typeof RunsResponse>;

export const queuePath = (importRunId: string) => `/admin/content-approval?importRun=${importRunId}`;
