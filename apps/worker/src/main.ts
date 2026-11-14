import { collectMigrations, createDb, migrate, workspacePackageDirs } from "@ibbun/db";
import { createSqsJobsFromEnv } from "@ibbun/jobs";
import { resolve } from "node:path";
import { startWorker } from "./worker.ts";
import { slices } from "./slices.generated.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const root = resolve(import.meta.dirname, "../../..");
const db = createDb(url);
await migrate(db.$client, await collectMigrations(await workspacePackageDirs(root)));

const jobs = createSqsJobsFromEnv(process.env);
const names = await startWorker(jobs, slices, { db, sessions: { resolve: async () => null } });
console.log(`worker running ${names.length} job type(s)`);

const stop = async () => {
  await jobs.stop();
  await db.$client.end();
  process.exit();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
