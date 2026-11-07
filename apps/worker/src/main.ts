import { collectMigrations, createDb, migrate, workspacePackageDirs } from "@mojibun/db";
import { createPgBossJobs } from "@mojibun/jobs";
import { resolve } from "node:path";
import { startWorker } from "./worker.ts";
import { slices } from "./slices.generated.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const root = resolve(import.meta.dirname, "../../..");
const db = createDb(url, { max: 1 });
await migrate(db.$client, await collectMigrations(await workspacePackageDirs(root)));
await db.$client.end();

const jobs = await createPgBossJobs(url);
const names = await startWorker(jobs, slices, { databaseUrl: url });
console.log(`worker running ${names.length} job type(s)`);

const stop = async () => {
  await jobs.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
