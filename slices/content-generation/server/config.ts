import { z } from "zod";

/** The daily token budget and how it splits into pools (content-approval.md#budget). */
export const GenerationConfig = z.object({
  /** Tokens per UTC day, generator and reviewer calls together. */
  dailyTokenBudget: z.number().int().positive(),
  /** The share of the budget Batch Texts and their reviews may use: at most one half. */
  batchTextShare: z.number().positive().max(0.5),
});
export type GenerationConfig = z.output<typeof GenerationConfig>;

/** Reads DAILY_TOKEN_BUDGET (default 2,000,000). Batch Texts always get the full 50% share. */
export const loadGenerationConfig = (env: Record<string, string | undefined>): GenerationConfig =>
  GenerationConfig.parse({ dailyTokenBudget: Number(env.DAILY_TOKEN_BUDGET || 2_000_000), batchTextShare: 0.5 });
