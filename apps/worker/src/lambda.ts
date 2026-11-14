import { createDb } from "@ibbun/db";
import { sqsHandler } from "@ibbun/jobs";
import { jobHandlers } from "./worker.ts";
import { slices } from "./slices.generated.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// Migrations are not run here: the stack runs them once per deploy, not on every cold start.
// Schedules are not started here either: EventBridge Scheduler sends the scheduled jobs.
export const handler = sqsHandler(await jobHandlers(slices, { db: createDb(url, { max: 2 }), sessions: { resolve: async () => null } }));
