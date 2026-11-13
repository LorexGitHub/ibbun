import { createAuthoring } from "@ibbun/content-graph/authoring";
import { transaction, type Db } from "@ibbun/db";
import { createPgBossJobs } from "@ibbun/jobs";
import { createSudachiNlp } from "@ibbun/nlp";
import type { GrammarSeedDeps } from "./index.ts";

const required = (env: Record<string, string | undefined>, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

/** Sudachi and the job queue are only needed when the one-time seed runs, so the queue connects on first use. */
export const connectGrammarSeed = (db: Db, env: Record<string, string | undefined>): GrammarSeedDeps => {
  const databaseUrl = required(env, "DATABASE_URL");
  const nlp = createSudachiNlp({ url: required(env, "SUDACHI_URL") });
  let queue: ReturnType<typeof createPgBossJobs> | undefined;
  return {
    nlp,
    jobs: { enqueue: async (contract, payload) => (await (queue ??= createPgBossJobs(databaseUrl))).enqueue(contract, payload) },
    authoring: createAuthoring(db),
    transact: (work) => transaction(db, (tx) => work(createAuthoring(tx))),
  };
};
