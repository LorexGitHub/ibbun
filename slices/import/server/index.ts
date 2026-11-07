import { Hono } from "hono";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createAuthoring } from "@mojibun/content-graph/authoring";
import { importApi } from "./api.ts";
import { importJobs, refreshes, type Refresh } from "./jobs.ts";
import { directoryRawFiles } from "./raw-files.ts";
import { postgresSnapshots } from "./snapshots.ts";

/** Where raw upstream files of the last runs are kept: a Docker volume in Compose (import-pipeline.md#what-is-kept). */
const DEFAULT_RAW_DIR = "./data/import-raw";

/** Wires the slice to Postgres, the raw-file volume and the session check the report API needs. */
export const createImportServer = ({ db, sessions }: ServerContext, options: { rawDir?: string; refreshes?: Refresh[] } = {}): ServerPart => {
  const authoring = createAuthoring(db);
  const snapshots = postgresSnapshots(db);
  const raw = directoryRawFiles(options.rawDir ?? process.env.IMPORT_RAW_DIR ?? DEFAULT_RAW_DIR);
  const { jobs, schedules } = importJobs({ authoring, snapshots, raw }, options.refreshes ?? refreshes());
  return { jobs, schedules, api: new Hono().route("/", importApi({ authoring, snapshots, sessions })) };
};

export default async (context: ServerContext): Promise<ServerPart> => createImportServer(context);
