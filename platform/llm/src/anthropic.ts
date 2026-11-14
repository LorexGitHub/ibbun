import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { costUsd, modelFor, type LlmConfig } from "./config.ts";
import { LlmError, parseJson, type Llm, type LlmRequest, type LlmRole } from "./llm.ts";

/** Below the SDK's non-streaming timeout, and far above any single draft or review. */
const DEFAULT_MAX_TOKENS = 16_000;

export type AnthropicLlmOptions = {
  readonly config: LlmConfig;
  /** Defaults to the SDK's own: ANTHROPIC_API_KEY, or an `ant auth login` profile. */
  readonly client?: Anthropic;
};

/**
 * The Claude API client. Answers are constrained to the request's JSON Schema
 * (structured outputs). Refusals are not retried on another model here: a
 * refused draft is a failed attempt, which Content Approval already counts.
 */
export const createAnthropicLlm = ({ config, client = new Anthropic() }: AnthropicLlmOptions): Llm => {
  const call = async <S extends z.ZodType>(
    role: LlmRole,
    { system, prompt, output, maxTokens = DEFAULT_MAX_TOKENS }: LlmRequest<S>,
  ) => {
    const response = await client.messages.create({
      model: modelFor(config, role),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: zodOutputFormat(output) },
    });
    const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    const spent = { model: response.model, usage, costUsd: costUsd(response.model, usage) };
    const fail = (why: string) => new LlmError(`${response.model} ${why}`, spent.model, usage, spent.costUsd);

    if (response.stop_reason !== "end_turn") throw fail(`stopped with ${response.stop_reason}`);
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const parsed = output.safeParse(parseJson(text));
    if (!parsed.success) throw fail(`answered outside the requested shape: ${parsed.error.message}`);
    return { ...spent, output: parsed.data as z.output<S> };
  };

  return { generate: (request) => call("generator", request), review: (request) => call("reviewer", request) };
};
