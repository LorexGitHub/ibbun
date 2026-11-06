import type { z } from "zod";
import { costUsd, modelFor, type LlmConfig } from "./config.ts";
import { LlmError, type Llm, type LlmRequest, type LlmRole } from "./llm.ts";

/** One call the fake received. */
export type FakeLlmCall = { readonly role: LlmRole; readonly system: string; readonly prompt: string };

export interface FakeLlm extends Llm {
  /** Every call so far, oldest first. */
  calls(): FakeLlmCall[];
}

/**
 * A deterministic stand-in for Claude. `answer` decides what the model says;
 * the answer is checked against the request's shape as a real answer is.
 * Tokens are counted as characters: the prompt's in, the answer's JSON out.
 */
export const createFakeLlm = ({
  config,
  answer,
}: {
  config: LlmConfig;
  answer: (call: FakeLlmCall) => unknown;
}): FakeLlm => {
  const seen: FakeLlmCall[] = [];

  const call = async <S extends z.ZodType>(role: LlmRole, { system, prompt, output }: LlmRequest<S>) => {
    const received = { role, system, prompt };
    seen.push(received);
    const said = answer(received);
    const model = modelFor(config, role);
    const usage = { inputTokens: system.length + prompt.length, outputTokens: JSON.stringify(said).length };
    const parsed = output.safeParse(said);
    if (!parsed.success)
      throw new LlmError(`${model} answered outside the requested shape: ${parsed.error.message}`, model, usage, costUsd(model, usage));
    return { output: parsed.data as z.output<S>, model, usage, costUsd: costUsd(model, usage) };
  };

  return {
    generate: (request) => call("generator", request),
    review: (request) => call("reviewer", request),
    calls: () => [...seen],
  };
};
