import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createClaudeCodeLlm, createLlmFromEnv, createOllamaLlm, LlmError, loadLlmConfig, type LlmRequest, type RunClaude } from "./index.ts";

const config = loadLlmConfig({ LLM_GENERATOR_MODEL: "gemma4:12b" });

const Draft = z.object({ sentence: z.string().min(1) });
const Verdict = z.object({ approved: z.boolean() });
const draftRequest: LlmRequest<typeof Draft> = { system: "Write one N5 Sentence.", prompt: "Use 猫.", output: Draft };
const reviewRequest: LlmRequest<typeof Verdict> = { system: "Judge the draft.", prompt: "猫が魚を食べました。", output: Verdict };

type ChatBody = { model: string; format: unknown; messages: { role: string; content: string }[]; options: { num_predict: number } };

/** Answers like Ollama's /api/chat, and records each request body. */
const ollama = (respond: (body: ChatBody) => object) => {
  const seen: ChatBody[] = [];
  const fetch = async (_url: string | URL | Request, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body)) as ChatBody;
    seen.push(body);
    return Response.json({ model: body.model, done_reason: "stop", prompt_eval_count: 80, eval_count: 12, ...respond(body) });
  };
  return { llm: createOllamaLlm({ config, fetch: fetch as typeof globalThis.fetch }), seen };
};
const says = (value: unknown) => ({ message: { role: "assistant", content: JSON.stringify(value) } });

describe("Ollama llm, replaying /api/chat answers", () => {
  it("sends the system prompt, the prompt and the JSON Schema as format, and parses the answer", async () => {
    const { llm, seen } = ollama(() => says({ sentence: "猫です。" }));
    const result = await llm.generate({ ...draftRequest, maxTokens: 300 });
    expect(result).toEqual({ output: { sentence: "猫です。" }, model: "gemma4:12b", usage: { inputTokens: 80, outputTokens: 12 }, costUsd: 0 });
    expect(seen[0]).toMatchObject({
      model: "gemma4:12b",
      options: { num_predict: 300 },
      messages: [
        { role: "system", content: draftRequest.system },
        { role: "user", content: draftRequest.prompt },
      ],
      format: { type: "object", properties: { sentence: { type: "string" } }, required: ["sentence"] },
    });
  });

  it("rejects an answer cut off at the token limit, reporting its tokens", async () => {
    const { llm } = ollama(() => ({ ...says({ sentence: "猫" }), done_reason: "length" }));
    const error = (await llm.generate(draftRequest).catch((e: unknown) => e)) as LlmError;
    expect(error).toBeInstanceOf(LlmError);
    expect([error.message, error.usage]).toEqual(["gemma4:12b stopped with length", { inputTokens: 80, outputTokens: 12 }]);
  });

  it("rejects an answer outside the requested shape", async () => {
    const { llm } = ollama(() => says({ sentence: "" }));
    await expect(llm.generate(draftRequest)).rejects.toThrow("gemma4:12b answered outside the requested shape");
  });

  it("rejects an HTTP error", async () => {
    const fetch = async () => new Response("model not found", { status: 404 });
    const llm = createOllamaLlm({ config, fetch: fetch as typeof globalThis.fetch });
    await expect(llm.generate(draftRequest)).rejects.toThrow("ollama answered 404: model not found");
  });
});

/** Answers like `claude -p --output-format json`, and records each run. */
const claudeCode = (respond: (args: readonly string[]) => object) => {
  const seen: { args: readonly string[]; stdin: string }[] = [];
  const run: RunClaude = async (args, stdin) => {
    seen.push({ args, stdin });
    return JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      modelUsage: {
        "claude-haiku-4-5-20251001": { inputTokens: 900, outputTokens: 13, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
        "claude-opus-5-5": { inputTokens: 2, outputTokens: 90, cacheReadInputTokens: 100, cacheCreationInputTokens: 5585 },
      },
      ...respond(args),
    });
  };
  return { llm: createClaudeCodeLlm({ config, run }), seen };
};

describe("Claude Code llm, replaying claude -p answers", () => {
  it("runs the reviewer model without tools, the prompt on stdin and the JSON Schema as an argument", async () => {
    const { llm, seen } = claudeCode(() => ({ structured_output: { approved: true } }));
    const result = await llm.review(reviewRequest);
    expect(result).toEqual({ output: { approved: true }, model: "claude-opus-5-5", usage: { inputTokens: 5687, outputTokens: 90 }, costUsd: 0 });
    const { args, stdin } = seen[0]!;
    expect(stdin).toBe(reviewRequest.prompt);
    const flag = (name: string) => args[args.indexOf(name) + 1];
    expect([args[0], flag("--model"), flag("--system-prompt"), flag("--tools"), flag("--output-format")]).toEqual([
      "-p",
      "claude-opus-5-5",
      reviewRequest.system,
      "",
      "json",
    ]);
    const schema = JSON.parse(flag("--json-schema")!) as Record<string, unknown>;
    expect(schema).toMatchObject({ type: "object", properties: { approved: { type: "boolean" } } });
    expect(schema).not.toHaveProperty("$schema");
  });

  it("rejects a run that ended in error, reporting its tokens", async () => {
    const { llm } = claudeCode(() => ({ subtype: "error_max_turns", is_error: true }));
    const error = (await llm.review(reviewRequest).catch((e: unknown) => e)) as LlmError;
    expect(error).toBeInstanceOf(LlmError);
    expect(error.message).toContain("claude-opus-5-5 stopped with error_max_turns");
    expect(error.usage).toEqual({ inputTokens: 5687, outputTokens: 90 });
  });

  it("rejects a structured output outside the requested shape", async () => {
    const { llm } = claudeCode(() => ({ structured_output: { approved: "yes" } }));
    await expect(llm.review(reviewRequest)).rejects.toThrow("claude-opus-5-5 answered outside the requested shape");
  });
});

describe("createLlmFromEnv", () => {
  const base = { LLM_GENERATOR_MODEL: "gemma4:12b" };

  it("takes one provider per role from LLM_PROVIDER", () => {
    expect(() => createLlmFromEnv({ ...base, LLM_PROVIDER: "ollama,claude-code" })).not.toThrow();
    expect(() => createLlmFromEnv({ ...base, LLM_PROVIDER: "ollama" })).not.toThrow();
  });

  it("refuses an unknown provider, or more than two", () => {
    const message = "LLM_PROVIDER must be one or two of anthropic, ollama, claude-code";
    expect(() => createLlmFromEnv({ ...base, LLM_PROVIDER: "openai" })).toThrow(message);
    expect(() => createLlmFromEnv({ ...base, LLM_PROVIDER: "ollama,ollama,ollama" })).toThrow(message);
  });

  it("still refuses one model for both roles", () => {
    expect(() => createLlmFromEnv({ LLM_PROVIDER: "ollama", LLM_GENERATOR_MODEL: "gemma4:12b", LLM_REVIEWER_MODEL: "gemma4:12b" })).toThrow(
      "generator and reviewer must be different models",
    );
  });
});
