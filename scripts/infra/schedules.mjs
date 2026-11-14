import { createDb } from "../../platform/db/src/index.ts";
import { slices } from "../../apps/worker/src/slices.generated.ts";
import { startWorker } from "../../apps/worker/src/worker.ts";

/**
 * Every job the slices run on a schedule, as `{ name, cron, payload }`. The stack turns each into an
 * EventBridge Scheduler entry, so the worker Lambda needs no timer. The database is never queried: a
 * pool connects on first use.
 */
export const scheduledJobs = async () => {
  const found = [];
  const recorder = {
    enqueue: async () => {},
    work: async () => {},
    stop: async () => {},
    schedule: async (contract, cron, payload) => void found.push({ name: contract.name, cron, payload: contract.payload.parse(payload) }),
  };
  // Some slices read DATABASE_URL while they load, and none connects until its first query.
  const url = (process.env.DATABASE_URL ??= "postgres://stack:stack@localhost:5432/stack");
  const db = createDb(url, { max: 1 });
  try {
    await startWorker(recorder, slices, { db, sessions: { resolve: async () => null } });
  } finally {
    await db.$client.end();
  }
  return found;
};
