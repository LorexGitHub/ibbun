import { createAnthropicLlm } from "./anthropic.ts";
import { createClaudeCodeLlm } from "./claude-code.ts";
import { loadLlmConfig, type LlmConfig } from "./config.ts";
import type { Llm } from "./llm.ts";
import { createOllamaLlm } from "./ollama.ts";

const PROVIDERS = {
  anthropic: (config: LlmConfig) => createAnthropicLlm({ config }),
  ollama: (config: LlmConfig, env: Env) => createOllamaLlm({ config, url: env.OLLAMA_HOST || undefined }),
  "claude-code": (config: LlmConfig) => createClaudeCodeLlm({ config }),
} satisfies Record<string, (config: LlmConfig, env: Env) => Llm>;

type Env = Record<string, string | undefined>;
type Provider = keyof typeof PROVIDERS;

const isProvider = (name: string): name is Provider => name in PROVIDERS;

/**
 * The Llm the env asks for. LLM_PROVIDER names one provider for both roles, or
 * `generator,reviewer`, e.g. `ollama,claude-code` (ADR 0016). Unset, it is the
 * Anthropic API, which production uses.
 */
export const createLlmFromEnv = (env: Env): Llm => {
  const config = loadLlmConfig(env);
  const names = (env.LLM_PROVIDER || "anthropic").split(",").map((name) => name.trim());
  const [generator, reviewer = generator] = names;
  const unknown = names.find((name) => !isProvider(name));
  if (names.length > 2 || unknown !== undefined) throw new Error(`LLM_PROVIDER must be one or two of ${Object.keys(PROVIDERS).join(", ")}`);
  const drafts = PROVIDERS[generator as Provider](config, env);
  const reviews = reviewer === generator ? drafts : PROVIDERS[reviewer as Provider](config, env);
  return { generate: (request) => drafts.generate(request), review: (request) => reviews.review(request) };
};
