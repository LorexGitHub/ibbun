import { createAuthoring } from "@ibbun/content-graph/authoring";
import type { Db } from "@ibbun/db";
import { createSqsJobsFromEnv } from "@ibbun/jobs";
import type { MatcherRunsDeps } from "./index.ts";

/** The job queue is only called when a run opens a Generation Request. */
export const connectMatcherRuns = (db: Db, env: Record<string, string | undefined>): MatcherRunsDeps => ({
  authoring: createAuthoring(db),
  jobs: createSqsJobsFromEnv(env),
});
