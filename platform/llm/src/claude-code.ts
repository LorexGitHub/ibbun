import { execFile } from "node:child_process";
import { z } from "zod";
import { modelFor, type LlmConfig } from "./config.ts";
import { LlmError, type Llm, type LlmRequest, type LlmRole } from "./llm.ts";

/** Runs the `claude` CLI with these arguments and the prompt on stdin, resolving to its stdout. */
export type RunClaude = (args: readonly string[], stdin: string) => Promise<string>;

export type ClaudeCodeLlmOptions = {
  readonly config: LlmConfig;
  readonly run?: RunClaude;
};

/** The part of `claude -p --output-format json` this adapter reads. */
type ClaudeResult = {
  readonly is_error: boolean;
  readonly subtype: string;
  readonly result?: string;
  readonly structured_output?: unknown;
  readonly modelUsage?: Record<
    string,
    { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }
  >;
};

const runClaude: RunClaude = (args, stdin) =>
  new Promise((resolve, reject) => {
    const child = execFile("claude", [...args], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
      error ? reject(new Error(`claude -p failed: ${stderr || error.message}`)) : resolve(stdout),
    );
    child.stdin!.end(stdin);
  });

/**
 * Claude through `claude -p` on the owner's subscription (ADR 0016), for local
 * and development runs only. It has no tools and keeps no session. Calls cost
 * nothing per token, so costUsd is 0; the daily token budget still counts them.
 */
export const createClaudeCodeLlm = ({ config, run = runClaude }: ClaudeCodeLlmOptions): Llm => {
  const call = async <S extends z.ZodType>(role: LlmRole, { system, prompt, output }: LlmRequest<S>) => {
    const model = modelFor(config, role);
    const args = ["-p", "--model", model, "--system-prompt", system, "--tools", "", "--no-session-persistence"];
    // The CLI's validator does not know zod's draft 2020-12 meta-schema.
    const { $schema: _, ...schema } = z.toJSONSchema(output);
    const answer = JSON.parse(await run([...args, "--output-format", "json", "--json-schema", JSON.stringify(schema)], prompt)) as ClaudeResult;
    const used = answer.modelUsage?.[model];
    const usage = {
      inputTokens: used ? used.inputTokens + used.cacheReadInputTokens + used.cacheCreationInputTokens : 0,
      outputTokens: used?.outputTokens ?? 0,
    };
    const fail = (why: string) => new LlmError(`${model} ${why}`, model, usage, 0);

    if (answer.is_error || answer.subtype !== "success") throw fail(`stopped with ${answer.subtype}: ${answer.result ?? ""}`);
    const parsed = output.safeParse(answer.structured_output);
    if (!parsed.success) throw fail(`answered outside the requested shape: ${parsed.error.message}`);
    return { output: parsed.data as z.output<S>, model, usage, costUsd: 0 };
  };

  return { generate: (request) => call("generator", request), review: (request) => call("reviewer", request) };
};
