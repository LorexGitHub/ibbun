import { z } from "zod";
import { costUsd, modelFor, type LlmConfig } from "./config.ts";
import { LlmError, parseJson, type Llm, type LlmRequest, type LlmRole } from "./llm.ts";

const DEFAULT_MAX_TOKENS = 16_000;

export type OllamaLlmOptions = {
  readonly config: LlmConfig;
  /** Defaults to OLLAMA_HOST's usual value. */
  readonly url?: string;
  readonly fetch?: typeof globalThis.fetch;
};

/** The part of an /api/chat answer this adapter reads. */
type ChatResponse = {
  readonly model: string;
  readonly message: { readonly content: string };
  readonly done_reason?: string;
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
};

/**
 * A local model behind Ollama (ADR 0016), for local and development runs only.
 * The request's JSON Schema goes in `format`, which Ollama enforces while sampling.
 */
export const createOllamaLlm = ({ config, url = "http://localhost:11434", fetch = globalThis.fetch }: OllamaLlmOptions): Llm => {
  const call = async <S extends z.ZodType>(role: LlmRole, { system, prompt, output, maxTokens = DEFAULT_MAX_TOKENS }: LlmRequest<S>) => {
    const model = modelFor(config, role);
    const response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: z.toJSONSchema(output),
        options: { num_predict: maxTokens },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`ollama answered ${response.status}: ${await response.text()}`);
    const answer = (await response.json()) as ChatResponse;
    const usage = { inputTokens: answer.prompt_eval_count ?? 0, outputTokens: answer.eval_count ?? 0 };
    const spent = { model, usage, costUsd: costUsd(model, usage) };
    const fail = (why: string) => new LlmError(`${model} ${why}`, model, usage, spent.costUsd);

    if (answer.done_reason !== "stop") throw fail(`stopped with ${answer.done_reason}`);
    const parsed = output.safeParse(parseJson(answer.message.content));
    if (!parsed.success) throw fail(`answered outside the requested shape: ${parsed.error.message}`);
    return { ...spent, output: parsed.data as z.output<S> };
  };

  return { generate: (request) => call("generator", request), review: (request) => call("reviewer", request) };
};
