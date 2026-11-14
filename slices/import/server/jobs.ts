import { z } from "zod";
import { defineJob, handler, type JobHandler } from "@ibbun/jobs";
import type { Dataset } from "@ibbun/content-graph/authoring";
import { createSudachiNlp } from "@ibbun/nlp";
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
import type { Home, ImportTasks } from "./tasks.ts";

/** `scheduled` is set by the schedule, which only runs when the refresh is due; a person's replay sets `release` or neither. */
export const RefreshPayload = z.object({ scheduled: z.boolean().default(false), release: z.boolean().default(false) });

export const refreshJob = (dataset: Dataset) => defineJob(`import.${dataset}`, RefreshPayload);
export const StalenessCheck = defineJob("import.staleness", z.object({}));

/** A dataset the slice refreshes on its own: how often the schedule looks, whether a run is only due once a month, and where it runs on AWS. */
export type Refresh = { source: Source; cron: string; monthly: boolean; home: Home };

/**
 * Each further source adds one line here and a folder under `sources/`. `home` follows a first import's time on a laptop
 * (#258): JMdict (17 min) and Tatoeba (20 min) pass the worker Lambda's 15 minutes, so they run as Fargate tasks.
 */
export const refreshes = (env: { SUDACHI_URL?: string } = process.env, download: Fetch = patient(fetch)): Refresh[] => [
  // JMdict: the EDRDG licence wants a refresh at least monthly, so the first Monday, retried daily until it lands.
  { source: jmdictSource(download) as Source, cron: "0 12 * * *", monthly: true, home: "fargate" },
  // KANJIDIC2 and KRADFILE: the same licence and release as JMdict, so the same schedule.
  { source: kanjidicSource(download) as Source, cron: "0 12 * * *", monthly: true, home: "lambda" },
  // KanjiVG: checked weekly. A run on a tag already applied downloads and changes nothing, so only a new release tag applies.
  { source: kanjivgSource(download) as Source, cron: "0 12 * * 1", monthly: false, home: "lambda" },
  // Tatoeba: exported Saturdays 06:30 UTC. Saturday and Sunday noon, so a failed Saturday run is tried once more; an applied version is a no-op.
  { source: tatoebaSource(createSudachiNlp({ url: env.SUDACHI_URL ?? "http://localhost:8000" }), download) as Source, cron: "0 12 * * 6,0", monthly: false, home: "fargate" },
  // yomitan-jlpt-vocab: checked every Monday, applied only when upstream has a new release (a rerun of a live version is a no-op).
  { source: yomitanSource(download) as Source, cron: "0 8 * * 1", monthly: false, home: "lambda" },
  // ja Wiktionary: no licence deadline, so weekly, as often as kaikki.org extracts. The run is a no-op until a new extraction date appears.
  { source: wiktionarySource(download) as Source, cron: "0 12 * * 1", monthly: false, home: "lambda" },
  // UniDic: a release every year or so, so weekly. The run is a no-op until a new release stamp appears.
  { source: unidicSource(download) as Source, cron: "0 12 * * 1", monthly: false, home: "lambda" },
  // Tanos kanji lists: one archived snapshot, so there is only ever one run. It needs KANJIDIC2 and fails until that is in,
  // so the daily retry lands it the day after; once applied, every later firing finds the version live and does nothing.
  { source: tanosSource(download) as Source, cron: "0 13 * * *", monthly: false, home: "lambda" },
];

const DAILY_STALENESS_CHECK = "0 7 * * *";

/** One refresh, here and now: the Import Run, then its report notes in the log. The worker and the Fargate task both run it. */
export const refreshNow = async (deps: ImportDeps, source: Source, release: boolean): Promise<void> => {
  const { report } = await runImport(deps, source, { release });
  for (const note of report.notes ?? []) console.info(`import.${source.dataset}: ${note}`);
};

export type ImportJobOptions = {
  now?: () => Date;
  /** Starts the refreshes whose home is `fargate`. Without it, every refresh runs in the worker. */
  tasks?: ImportTasks | null;
};

/** The job handlers, each carrying the schedule that starts it with no human in the loop. */
export const importJobs = (deps: ImportDeps, list: Refresh[], { now = () => new Date(), tasks = null }: ImportJobOptions = {}): JobHandler[] => {
  const refresh = ({ source, cron, monthly, home }: Refresh) =>
    handler(
      refreshJob(source.dataset),
      async ({ scheduled, release }) => {
        if (scheduled && monthly) {
          const live = await liveRun(deps.authoring, source.dataset);
          if (!monthlyRefreshDue(now(), live?.appliedAt ?? null)) return;
        }
        if (home === "fargate" && tasks) {
          console.info(`import.${source.dataset}: Fargate task ${await tasks.start({ dataset: source.dataset, release })}`);
          return;
        }
        await refreshNow(deps, source, release);
      },
      { cron, payload: { scheduled: true } },
    );
  const staleness = handler(StalenessCheck, async () => void (await checkStaleness(deps.authoring, now())), { cron: DAILY_STALENESS_CHECK, payload: {} });
  return [...list.map(refresh), staleness];
};
