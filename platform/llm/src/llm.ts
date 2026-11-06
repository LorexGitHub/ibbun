import type { z } from "zod";

/** Which model a call goes to. The generator drafts content; the reviewer judges it (content-approval.md#models). */
export type LlmRole = "generator" | "reviewer";

export type LlmRequest<S extends z.ZodType> = {
  readonly system: string;
  /** Everything the model sees besides the system prompt. A review gets the draft and its inputs, never the generator's reasoning. */
  readonly prompt: string;
  /** The shape the answer must have. The model is constrained to its JSON Schema, and the answer is parsed with it. */
  readonly output: S;
  readonly maxTokens?: number;
};

/** Tokens a call used. The daily budget counts both (content-approval.md#budget). */
export type TokenUsage = { readonly inputTokens: number; readonly outputTokens: number };

export type LlmResult<T> = {
  readonly output: T;
  /** The model that answered. */
  readonly model: string;
  readonly usage: TokenUsage;
  readonly costUsd: number;
};

export interface Llm {
  /** A call to the generator model. Rejects with LlmError when there is no answer of the requested shape. */
  generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<LlmResult<z.output<S>>>;
  /** A call to the reviewer model. Rejects with LlmError when there is no answer of the requested shape. */
  review<S extends z.ZodType>(request: LlmRequest<S>): Promise<LlmResult<z.output<S>>>;
}

/** A call that produced no usable answer. It still used tokens, so the budget must count them. */
export class LlmError extends Error {
  override readonly name = "LlmError";
  constructor(
    message: string,
    readonly model: string,
    readonly usage: TokenUsage,
    readonly costUsd: number,
  ) {
    super(message);
  }
}
