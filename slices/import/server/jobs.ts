import { z } from "zod";
import { defineJob, handler, type JobHandler } from "@mojibun/jobs";
import type { Dataset } from "@mojibun/content-graph/authoring";
import { createSudachiNlp } from "@mojibun/nlp";
import { jmdictSource } from "../sources/jmdict/index.ts";
import { tatoebaSource } from "../sources/tatoeba/index.ts";
import { runImport, type ImportDeps } from "./run.ts";
import { monthlyRefreshDue } from "./schedule.ts";
import type { Source } from "./source.ts";
import { checkStaleness, liveRun } from "./staleness.ts";

/** `scheduled` is set by the schedule, which only runs when the refresh is due; a person's replay sets `release` or neither. */
export const RefreshPayload = z.object({ scheduled: z.boolean().default(false), release: z.boolean().default(false) });

export const refreshJob = (dataset: Dataset) => defineJob(`import.${dataset}`, RefreshPayload);
export const StalenessCheck = defineJob("import.staleness", z.object({}));

/** A dataset the slice refreshes on its own: how often the schedule looks, and whether a run is only due once a month. */
export type Refresh = { source: Source; cron: string; monthly: boolean };

/** Each further source adds one line here and a folder under `sources/`. */
export const refreshes = (env: { SUDACHI_URL?: string } = process.env): Refresh[] => [
  // JMdict: the EDRDG licence wants a refresh at least monthly, so the first Monday, retried daily until it lands.
  { source: jmdictSource() as Source, cron: "0 12 * * *", monthly: true },
  // Tatoeba: exported Saturdays 06:30 UTC. Saturday and Sunday noon, so a failed Saturday run is tried once more; an applied version is a no-op.
  { source: tatoebaSource(createSudachiNlp({ url: env.SUDACHI_URL ?? "http://localhost:8000" })) as Source, cron: "0 12 * * 6,0", monthly: false },
];

const DAILY_STALENESS_CHECK = "0 7 * * *";

/** The job handlers, each carrying the schedule that starts it with no human in the loop. */
export const importJobs = (deps: ImportDeps, list: Refresh[], now: () => Date = () => new Date()): JobHandler[] => {
  const refresh = ({ source, cron, monthly }: Refresh) =>
    handler(
      refreshJob(source.dataset),
      async ({ scheduled, release }) => {
        if (scheduled && monthly) {
          const live = await liveRun(deps.authoring, source.dataset);
          if (!monthlyRefreshDue(now(), live?.appliedAt ?? null)) return;
        }
        await runImport(deps, source, { release });
      },
      { cron, payload: { scheduled: true } },
    );
  const staleness = handler(StalenessCheck, async () => void (await checkStaleness(deps.authoring, now())), { cron: DAILY_STALENESS_CHECK, payload: {} });
  return [...list.map(refresh), staleness];
};
