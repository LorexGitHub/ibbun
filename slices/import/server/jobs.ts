import { z } from "zod";
import { defineJob, handler, type JobHandler } from "@mojibun/jobs";
import type { Dataset } from "@mojibun/content-graph/authoring";
import { createSudachiNlp } from "@mojibun/nlp";
import { patient, type Fetch } from "../sources/release.ts";
import { jmdictSource } from "../sources/jmdict/index.ts";
import { kanjidicSource } from "../sources/kanjidic2/index.ts";
import { unidicSource } from "../sources/unidic-pitch/index.ts";
import { wiktionarySource } from "../sources/ja-wiktionary/index.ts";
import { tatoebaSource } from "../sources/tatoeba/index.ts";
import { kanjivgSource } from "../sources/kanjivg/index.ts";
import { tanosSource } from "../sources/tanos-kanji/index.ts";
import { yomitanSource } from "../sources/yomitan-jlpt-vocab/index.ts";
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
export const refreshes = (env: { SUDACHI_URL?: string } = process.env, download: Fetch = patient(fetch)): Refresh[] => [
  // JMdict: the EDRDG licence wants a refresh at least monthly, so the first Monday, retried daily until it lands.
  { source: jmdictSource(download) as Source, cron: "0 12 * * *", monthly: true },
  // KANJIDIC2 and KRADFILE: the same licence and release as JMdict, so the same schedule.
  { source: kanjidicSource(download) as Source, cron: "0 12 * * *", monthly: true },
  // KanjiVG: checked weekly. A run on a tag already applied downloads and changes nothing, so only a new release tag applies.
  { source: kanjivgSource(download) as Source, cron: "0 12 * * 1", monthly: false },
  // Tatoeba: exported Saturdays 06:30 UTC. Saturday and Sunday noon, so a failed Saturday run is tried once more; an applied version is a no-op.
  { source: tatoebaSource(createSudachiNlp({ url: env.SUDACHI_URL ?? "http://localhost:8000" }), download) as Source, cron: "0 12 * * 6,0", monthly: false },
  // yomitan-jlpt-vocab: checked every Monday, applied only when upstream has a new release (a rerun of a live version is a no-op).
  { source: yomitanSource(download) as Source, cron: "0 8 * * 1", monthly: false },
  // ja Wiktionary: no licence deadline, so weekly, as often as kaikki.org extracts. The run is a no-op until a new extraction date appears.
  { source: wiktionarySource(download) as Source, cron: "0 12 * * 1", monthly: false },
  // UniDic: a release every year or so, so weekly. The run is a no-op until a new release stamp appears.
  { source: unidicSource(download) as Source, cron: "0 12 * * 1", monthly: false },
  // Tanos kanji lists: one archived snapshot, so there is only ever one run. It needs KANJIDIC2 and fails until that is in,
  // so the daily retry lands it the day after; once applied, every later firing finds the version live and does nothing.
  { source: tanosSource(download) as Source, cron: "0 13 * * *", monthly: false },
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
        const { report } = await runImport(deps, source, { release });
        for (const note of report.notes ?? []) console.info(`import.${source.dataset}: ${note}`);
      },
      { cron, payload: { scheduled: true } },
    );
  const staleness = handler(StalenessCheck, async () => void (await checkStaleness(deps.authoring, now())), { cron: DAILY_STALENESS_CHECK, payload: {} });
  return [...list.map(refresh), staleness];
};
