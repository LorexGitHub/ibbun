import type { Authoring } from "@mojibun/content-graph/authoring";
import type { GenerationConfig } from "./config.ts";

export type Pool = "learner" | "general";

/** Kinds a Learner sets off: Batch Texts and Practice Texts (listening.md#limits). */
const LEARNER_TRIGGERED = ["batch-text", "practice-text"];

/** Learner-triggered kinds, including their reviews, share a pool of their own; everything else shares the rest. */
export const poolOf = (requestKind: string): Pool => (LEARNER_TRIGGERED.includes(requestKind) ? "learner" : "general");

export const limitOf = (config: GenerationConfig, pool: Pool): number => {
  const batch = Math.floor(config.dailyTokenBudget * config.batchTextShare);
  return pool === "learner" ? batch : config.dailyTokenBudget - batch;
};

const startOfDay = (now: Date) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

/** Tokens the pool's Generation Runs used since 00:00 UTC. */
export const spentToday = async (auth: Authoring, pool: Pool, now: Date): Promise<number> => {
  const poolOfRequest = new Map((await auth.rows("generationRequest")).map((r) => [r.id, poolOf(r.kind)]));
  return (await auth.rows("generationRun"))
    .filter((run) => poolOfRequest.get(run.requestId) === pool && run.at.getTime() >= startOfDay(now))
    .reduce((sum, run) => sum + run.tokens, 0);
};

export const isSpent = async (auth: Authoring, config: GenerationConfig, pool: Pool, now: Date): Promise<boolean> =>
  (await spentToday(auth, pool, now)) >= limitOf(config, pool);

/** Alerts the supervisor that a pool is spent; one open alert per pool is enough. */
export const alertExhausted = async (auth: Authoring, pool: Pool): Promise<void> => {
  const open = await auth.queue({ reason: "budget exhausted" });
  if (!open.some((entry) => (entry.detail as { pool?: Pool } | null)?.pool === pool))
    await auth.enqueue({ reason: "budget exhausted", detail: { pool } });
};
