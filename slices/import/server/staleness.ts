import type { Authoring, Dataset } from "@mojibun/content-graph/authoring";
import { ageInDays, isStale } from "./schedule.ts";

/** The EDRDG datasets, whose licence asks for a refresh at least monthly (licensing.md#monthly-refresh). */
export const EDRDG_DATASETS: Dataset[] = ["jmdict", "kanjidic"];

type Alarm = { dataset: string };

/** The newest applied run of a dataset: the data that is live. */
export const liveRun = async (authoring: Authoring, dataset: Dataset) =>
  (await authoring.rows("importRun", { dataset, status: "applied" }))
    .filter((r) => r.appliedAt)
    .sort((a, b) => b.appliedAt!.getTime() - a.appliedAt!.getTime())[0];

/**
 * Alerts the supervisor, in the Content Approval queue, when a live EDRDG dataset is older than 31 days, for example
 * because the run that would refresh it is held by the circuit breaker. One open alarm per dataset; it resolves itself
 * once the dataset is fresh again. A dataset that was never imported has no live data and raises nothing.
 * Returns the datasets that have an open alarm after the check.
 */
export const checkStaleness = async (authoring: Authoring, now: Date): Promise<Dataset[]> => {
  const alarms = await authoring.queue({ reason: "staleness alarm" });
  const stale: Dataset[] = [];
  for (const dataset of EDRDG_DATASETS) {
    const live = await liveRun(authoring, dataset);
    const open = alarms.filter((a) => (a.detail as Alarm | null)?.dataset === dataset);
    if (live && isStale(live.appliedAt!, now)) {
      stale.push(dataset);
      if (!open.length) await authoring.enqueue({ reason: "staleness alarm", importRunId: live.id, detail: { dataset, upstreamVersion: live.upstreamVersion, days: ageInDays(live.appliedAt!, now) } });
    } else for (const alarm of open) await authoring.resolve(alarm.id);
  }
  return stale;
};
