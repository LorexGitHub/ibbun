import { Hono } from "hono";
import type { ServerContext, ServerPart } from "@ibbun/slice";
import { createAuthoring } from "@ibbun/content-graph/authoring";
import { connectGrammarSeed } from "../sources/grammar-seed/connect.ts";
import { grammarSeedJob, type GrammarSeedDeps } from "../sources/grammar-seed/index.ts";
import { connectMatcherRuns } from "../sources/matcher-runs/connect.ts";
import { matcherRunsJob, type MatcherRunsDeps } from "../sources/matcher-runs/index.ts";
import { importApi } from "./report-api.ts";
import { importJobs, refreshes, type Refresh } from "./jobs.ts";
import { rawFilesAt } from "./raw-files.ts";
import { postgresSnapshots } from "./snapshots.ts";
import { importTasksFromEnv, type ImportTasks } from "./tasks.ts";

/** Where raw upstream files of the last runs are kept: a Docker volume in Compose, `s3://bucket/prefix` on AWS (import-pipeline.md#what-is-kept). */
export const DEFAULT_RAW_DIR = "./data/import-raw";

/** Wires the slice to Postgres, the raw-file volume and the session check the report API needs. */
export const createImportServer = ({ db, sessions }: ServerContext, options: { rawDir: string; refreshes: Refresh[]; tasks?: ImportTasks | null; grammarSeed?: () => GrammarSeedDeps; matcherRuns?: () => MatcherRunsDeps }): ServerPart => {
  const authoring = createAuthoring(db);
  const snapshots = postgresSnapshots(db);
  const raw = rawFilesAt(options.rawDir);
  const jobs = [...importJobs({ authoring, snapshots, raw }, options.refreshes, { tasks: options.tasks ?? null }), ...(options.grammarSeed ? [grammarSeedJob(options.grammarSeed)] : []), ...(options.matcherRuns ? [matcherRunsJob(options.matcherRuns)] : [])];
  return { jobs, api: new Hono().route("/", importApi({ authoring, snapshots, sessions })) };
};

export default async (context: ServerContext): Promise<ServerPart> =>
  createImportServer(context, {
    rawDir: process.env.IMPORT_RAW_DIR ?? DEFAULT_RAW_DIR,
    refreshes: refreshes(),
    tasks: importTasksFromEnv(process.env),
    grammarSeed: () => connectGrammarSeed(context.db, process.env),
    matcherRuns: () => connectMatcherRuns(context.db, process.env),
  });
