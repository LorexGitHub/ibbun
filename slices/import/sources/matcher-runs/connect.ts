import { createAuthoring } from "@ibbun/content-graph/authoring";
import type { Db } from "@ibbun/db";
import { createPgBossJobs } from "@ibbun/jobs";
import type { MatcherRunsDeps } from "./index.ts";

/** The job queue is only needed when a run opens a Generation Request, so it connects on first use. */
export const connectMatcherRuns = (db: Db, env: Record<string, string | undefined>): MatcherRunsDeps => {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  let queue: ReturnType<typeof createPgBossJobs> | undefined;
  return {
    authoring: createAuthoring(db),
    jobs: { enqueue: async (contract, payload) => (await (queue ??= createPgBossJobs(databaseUrl))).enqueue(contract, payload) },
  };
};
