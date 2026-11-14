import { z } from "zod";
import type { LlmRole, TokenUsage } from "./llm.ts";

/** US dollars per million tokens, Anthropic first-party API rates, and $0 for local models (ADR 0016). A model must be listed here to be configured. */
export const LLM_PRICES: Readonly<Record<string, { readonly input: number; readonly output: number }>> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "gemma4:12b": { input: 0, output: 0 },
};

const PricedModel = z.string().refine((model) => model in LLM_PRICES, { error: "has no price in LLM_PRICES" });

/** Which model plays each role. They must differ: the reviewer is a stronger model than the one it judges. */
export const LlmConfig = z
  .object({ generator: PricedModel, reviewer: PricedModel })
  .refine(({ generator, reviewer }) => generator !== reviewer, { error: "generator and reviewer must be different models" });
export type LlmConfig = z.output<typeof LlmConfig>;

/** Reads LLM_GENERATOR_MODEL and LLM_REVIEWER_MODEL. Unset or empty, they default to Sonnet 5.5 and Opus 5.5. */
export const loadLlmConfig = (env: Record<string, string | undefined>): LlmConfig =>
  LlmConfig.parse({
    generator: env.LLM_GENERATOR_MODEL || "claude-sonnet-5-5",
    reviewer: env.LLM_REVIEWER_MODEL || "claude-opus-5-5",
  });

export const modelFor = (config: LlmConfig, role: LlmRole) => config[role];

/** What a call cost at the model's list price. No call sets prompt caching, so input and output tokens are the whole bill. */
export const costUsd = (model: string, { inputTokens, outputTokens }: TokenUsage): number => {
  const price = LLM_PRICES[model];
  if (!price) throw new Error(`no price for model ${model}`);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
};
