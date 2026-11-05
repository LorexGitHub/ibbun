import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { costUsd, createAnthropicLlm, createFakeLlm, LlmError, loadLlmConfig, type Llm, type LlmRequest } from "./index.ts";

const config = loadLlmConfig({});

const Draft = z.object({ sentence: z.string().min(1), level: z.enum(["N5", "N4"]) });
const Verdict = z.object({ approved: z.boolean() });

const DRAFT = { sentence: "猫が魚を食べました。", level: "N5" } as const;
const draftRequest: LlmRequest<typeof Draft> = { system: "Write one N5 Sentence.", prompt: "Use 猫 and 食べる.", output: Draft };
const reviewRequest: LlmRequest<typeof Verdict> = { system: "Judge the draft.", prompt: JSON.stringify(DRAFT), output: Verdict };

/** Behaviour every Llm shares, given one that drafts DRAFT and approves it. */
const llmContract = (make: () => Llm) => {
  it("sends a draft to the generator model and parses its answer", async () => {
    const result = await make().generate(draftRequest);
    expect(result.output).toEqual(DRAFT);
    expect(result.model).toBe("claude-sonnet-5-5");
  });

  it("sends a review to the reviewer model", async () => {
    const result = await make().review(reviewRequest);
    expect(result.output).toEqual({ approved: true });
    expect(result.model).toBe("claude-opus-5-5");
  });

  it("counts the tokens and prices them at the model's rate", async () => {
    const { model, usage, costUsd: cost } = await make().review(reviewRequest);
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
    expect(cost).toBe(costUsd(model, usage));
  });

  it("rejects an answer outside the requested shape, still reporting what it cost", async () => {
    const error = await make()
      .generate({ ...draftRequest, output: z.object({ sentence: z.string(), level: z.literal("N1") }) })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ name: "LlmError", model: "claude-sonnet-5-5", message: expect.stringContaining("outside the requested shape") });
    expect((error as LlmError).costUsd).toBe(costUsd("claude-sonnet-5-5", (error as LlmError).usage));
    expect((error as LlmError).usage.outputTokens).toBeGreaterThan(0);
  });
};

describe("loadLlmConfig", () => {
  it("defaults to Sonnet 5.5 for drafts and Opus 5.5 for reviews", () => {
    expect(config).toEqual({ generator: "claude-sonnet-5-5", reviewer: "claude-opus-5-5" });
  });

  it("reads the models from the environment", () => {
    expect(loadLlmConfig({ LLM_GENERATOR_MODEL: "claude-opus-5-5", LLM_REVIEWER_MODEL: "claude-sonnet-5-5" })).toEqual({
      generator: "claude-opus-5-5",
      reviewer: "claude-sonnet-5-5",
    });
  });

  it("treats an empty variable as unset", () => {
    expect(loadLlmConfig({ LLM_GENERATOR_MODEL: "", LLM_REVIEWER_MODEL: "" })).toEqual(config);
  });

  it("refuses one model for both roles", () => {
    expect(() => loadLlmConfig({ LLM_REVIEWER_MODEL: "claude-sonnet-5-5" })).toThrow("generator and reviewer must be different models");
  });

  it("refuses a model with no price", () => {
    expect(() => loadLlmConfig({ LLM_GENERATOR_MODEL: "claude-unknown" })).toThrow("has no price in LLM_PRICES");
  });
});

describe("costUsd", () => {
  it("prices input and output per million tokens", () => {
    expect(costUsd("claude-sonnet-5-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(2);
    expect(costUsd("claude-opus-5-5", { inputTokens: 250_000, outputTokens: 50_000 })).toBe(2);
  });

  it("rejects a model with no price", () => {
    expect(() => costUsd("claude-unknown", { inputTokens: 1, outputTokens: 1 })).toThrow("no price for model claude-unknown");
  });
});

const fakeAnswer = ({ role }: { role: string }) => (role === "generator" ? DRAFT : { approved: true });

describe("fake llm", () => {
  llmContract(() => createFakeLlm({ config, answer: fakeAnswer }));

  it("records each call and counts characters as tokens", async () => {
    const llm = createFakeLlm({ config, answer: fakeAnswer });
    const { usage } = await llm.generate(draftRequest);
    expect(llm.calls()).toEqual([{ role: "generator", system: draftRequest.system, prompt: draftRequest.prompt }]);
    expect(usage).toEqual({
      inputTokens: draftRequest.system.length + draftRequest.prompt.length,
      outputTokens: JSON.stringify(DRAFT).length,
    });
  });
});

type MessageBody = Anthropic.MessageCreateParamsNonStreaming;

/** Answers like the Messages API, and records each request body. */
const replay = (respond: (body: MessageBody) => Partial<Anthropic.Message>) => {
  const seen: MessageBody[] = [];
  const fetch = async (_url: string | URL | Request, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body)) as MessageBody;
    seen.push(body);
    return Response.json({
      id: "msg_replay",
      type: "message",
      role: "assistant",
      model: body.model,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 120, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      ...respond(body),
    });
  };
  const client = new Anthropic({ apiKey: "test-key", fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
  return { llm: createAnthropicLlm({ config, client }), seen };
};

const text = (value: unknown): Partial<Anthropic.Message> => ({
  content: [{ type: "text", text: JSON.stringify(value), citations: null }],
});
const claude = () => replay((body) => text(body.model === "claude-sonnet-5-5" ? DRAFT : { approved: true }));

describe("Anthropic llm, replaying Messages API answers", () => {
  llmContract(() => claude().llm);

  it("sends the system prompt, the prompt and the answer's JSON Schema", async () => {
    const { llm, seen } = claude();
    await llm.generate(draftRequest);
    await llm.review({ ...reviewRequest, maxTokens: 500 });
    expect(seen.map((b) => [b.model, b.max_tokens])).toEqual([
      ["claude-sonnet-5-5", 16_000],
      ["claude-opus-5-5", 500],
    ]);
    expect(seen[0]).toMatchObject({ system: draftRequest.system, messages: [{ role: "user", content: draftRequest.prompt }] });
    expect(seen[0]!.output_config!.format).toMatchObject({
      type: "json_schema",
      schema: {
        type: "object",
        properties: { sentence: { type: "string" }, level: { type: "string" } },
        required: ["sentence", "level"],
        additionalProperties: false,
      },
    });
  });

  it("reports the API's token counts and their cost", async () => {
    const result = await claude().llm.review(reviewRequest);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
    expect(result.costUsd).toBe((120 * 4 + 30 * 20) / 1_000_000);
  });

  it("joins the answer's text blocks", async () => {
    const { llm } = replay(() => ({
      content: [
        { type: "text", text: '{"approved":', citations: null },
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "false}", citations: null },
      ],
    }));
    expect((await llm.review(reviewRequest)).output).toEqual({ approved: false });
  });

  it.each([
    ["a refusal", "refusal"],
    ["an answer cut off at max_tokens", "max_tokens"],
  ] as const)("rejects %s, reporting what it cost", async (_, stop_reason) => {
    const { llm } = replay(() => ({ ...text({ approved: true }), stop_reason }));
    const error = (await llm.review(reviewRequest).catch((e: unknown) => e)) as LlmError;
    expect(error).toBeInstanceOf(LlmError);
    expect(error.message).toBe(`claude-opus-5-5 stopped with ${stop_reason}`);
    expect([error.model, error.usage, error.costUsd]).toEqual(["claude-opus-5-5", { inputTokens: 120, outputTokens: 30 }, 0.00108]);
  });

  it("rejects text that is not JSON", async () => {
    const { llm } = replay(() => ({ content: [{ type: "text", text: "Sure! Here it is:", citations: null }] }));
    await expect(llm.review(reviewRequest)).rejects.toThrow(LlmError);
  });

  it("lets an API error through as the SDK's typed error", async () => {
    const fetch = async () => Response.json({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }, { status: 429 });
    const client = new Anthropic({ apiKey: "test-key", fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
    await expect(createAnthropicLlm({ config, client }).generate(draftRequest)).rejects.toBeInstanceOf(Anthropic.RateLimitError);
  });
});

describe.runIf(process.env.LLM_LIVE_TESTS === "1")("Anthropic llm, against the Claude API (spends tokens)", () => {
  const live = () => {
    const llm = createAnthropicLlm({ config });
    const say = (expected: unknown) => `Answer with exactly this JSON and nothing else: ${JSON.stringify(expected)}`;
    return {
      generate: (request: LlmRequest<z.ZodType>) => llm.generate({ ...request, prompt: say(DRAFT) }),
      review: (request: LlmRequest<z.ZodType>) => llm.review({ ...request, prompt: say({ approved: true }) }),
    } as Llm;
  };
  llmContract(live);
});
