// The Fargate task (#258): one refresh, started by its job through `ECS.RunTask` from the worker's image, then exit.
// Needs DATABASE_URL, IMPORT_RAW_DIR, IMPORT_DATASET and, for Tatoeba, SUDACHI_URL.
import { createAuthoring } from "@ibbun/content-graph/authoring";
import { createDb } from "@ibbun/db";
import { DEFAULT_RAW_DIR } from "./import-server.ts";
import { refreshes, refreshNow } from "./jobs.ts";
import { rawFilesAt } from "./raw-files.ts";
import { postgresSnapshots } from "./snapshots.ts";
import { taskRequestFromEnv } from "./tasks.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const list = refreshes();
const [first, ...rest] = list.map(({ source }) => source.dataset);
const { dataset, release } = taskRequestFromEnv(process.env, [first!, ...rest]);
const { source } = list.find((r) => r.source.dataset === dataset)!;

const db = createDb(url, { max: 4 });
const started = performance.now();
try {
  await refreshNow({ authoring: createAuthoring(db), snapshots: postgresSnapshots(db), raw: rawFilesAt(process.env.IMPORT_RAW_DIR ?? DEFAULT_RAW_DIR) }, source, release);
  console.info(`import.${dataset}: done in ${((performance.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await db.$client.end();
}
