import { createDb } from "@ibbun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@ibbun/learner";
import { createMail, mailConfigFromEnv } from "@ibbun/mail";
import type { Hono } from "hono";
import { createApp } from "./app.ts";
import { slices } from "./slices.generated.ts";

export type Env = Record<string, string | undefined>;

/**
 * The whole API from its environment: the one Hono app both entry points serve,
 * `main.ts` on Node and `lambda.ts` on Lambda. `poolSize` caps the `pg` pool.
 */
export const createApi = async (env: Env, { poolSize }: { poolSize?: number } = {}): Promise<Hono> => {
  const { DATABASE_URL } = env;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const db = createDb(DATABASE_URL, { max: poolSize });
  const mail = createMail(mailConfigFromEnv(env));
  const { sessions, authHandler } = createLearnerAuth({ db, mail, config: learnerConfigFromEnv(env) });
  return createApp(slices, { db, sessions }, { authHandler });
};
