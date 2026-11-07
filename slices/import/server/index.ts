import { Hono } from "hono";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createAuthoring } from "@mojibun/content-graph/authoring";
import { createDb, type Db } from "@mojibun/db";
import { importApi } from "./api.ts";
import { importJobs, refreshes, type Refresh } from "./jobs.ts";
import { directoryRawFiles } from "./raw-files.ts";
import { postgresSnapshots } from "./snapshots.ts";

/** Where raw upstream files of the last runs are kept: a Docker volume in Compose (import-pipeline.md#what-is-kept). */
const DEFAULT_RAW_DIR = "./data/import-raw";

/** Wires the slice to Postgres and the raw-file volume. Without a database the slice has nothing to run. */
export const createImportServer = (
  context: ServerContext,
  options: { db?: Db; rawDir?: string; refreshes?: Refresh[] } = {},
): ServerPart => {
  if (!context.databaseUrl) return {};
  const db = options.db ?? createDb(context.databaseUrl, { max: 4 });
  const authoring = createAuthoring(db);
  const snapshots = postgresSnapshots(db);
  const raw = directoryRawFiles(options.rawDir ?? process.env.IMPORT_RAW_DIR ?? DEFAULT_RAW_DIR);
  const { jobs, schedules } = importJobs({ authoring, snapshots, raw }, options.refreshes ?? refreshes());
  // Without a session resolver the report API must not exist: it would have nothing to check a role against.
  return { jobs, schedules, api: context.sessions ? new Hono().route("/", importApi({ authoring, snapshots, sessions: context.sessions })) : undefined };
};

export default async (context: ServerContext): Promise<ServerPart> => createImportServer(context);
