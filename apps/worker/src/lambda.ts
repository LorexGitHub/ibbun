import { SSMClient } from "@aws-sdk/client-ssm";
import { createDb } from "@ibbun/db";
import { sqsHandler } from "@ibbun/jobs";
import { ssmParameters, withSecrets } from "./secrets.ts";
import { jobHandlers } from "./worker.ts";
import { slices } from "./slices.generated.ts";

// Runs once per cold start. The secrets (ANTHROPIC_API_KEY) come from SSM here, never per job, and
// land in the environment where the slices' clients read them.
Object.assign(process.env, await withSecrets(process.env, ssmParameters(new SSMClient({}))));

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// Migrations are not run here: the stack runs them once per deploy, not on every cold start.
// Schedules are not started here either: EventBridge Scheduler sends the scheduled jobs.
// The pool is small: one job runs per invocation, and Aurora's connection limit is shared (ADR 0015).
export const handler = sqsHandler(await jobHandlers(slices, { db: createDb(url, { max: 2 }), sessions: { resolve: async () => null } }));
