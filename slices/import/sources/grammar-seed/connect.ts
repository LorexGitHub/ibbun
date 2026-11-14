import { createAuthoring } from "@ibbun/content-graph/authoring";
import { transaction, type Db } from "@ibbun/db";
import { createSqsJobsFromEnv } from "@ibbun/jobs";
import { createSudachiNlp } from "@ibbun/nlp";
import type { GrammarSeedDeps } from "./index.ts";

export const required = (env: Record<string, string | undefined>, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

/** Sudachi and the job queue are only needed when the one-time seed runs, so neither is called until then. */
export const connectGrammarSeed = (db: Db, env: Record<string, string | undefined>): GrammarSeedDeps => {
  const nlp = createSudachiNlp({ url: required(env, "SUDACHI_URL") });
  return {
    nlp,
    jobs: createSqsJobsFromEnv(env),
    authoring: createAuthoring(db),
    transact: (work) => transaction(db, (tx) => work(createAuthoring(tx))),
  };
};
