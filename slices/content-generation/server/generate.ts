import { ContentGenerate, ContentReview } from "@mojibun/content-graph/jobs";
import type { Authoring, GenerationRequest } from "@mojibun/content-graph/authoring";
import { handler, type JobHandler, type Jobs } from "@mojibun/jobs";
import { LlmError, type Llm } from "@mojibun/llm";
import { KINDS } from "../kinds/index.ts";
import type { Plan } from "../kinds/kind.ts";
import { alertExhausted, isSpent, poolOf } from "./budget.ts";
import type { GenerationConfig } from "./config.ts";

export type GenerationDeps = {
  auth: Authoring;
  llm: Llm;
  /** Where `content.review` and the next attempt are enqueued. */
  jobs: Jobs;
  config: GenerationConfig;
  now?: () => Date;
};

/** Uses an attempt. Unless that was the last, the next one starts with `feedback`. */
const retry = async ({ auth, jobs }: GenerationDeps, requestId: string, feedback: string) => {
  const { status } = await auth.failAttempt(requestId);
  if (status === "open") await jobs.enqueue(ContentGenerate, { requestId, feedback });
};

/** One LLM call. A call that gave no usable answer is still a Generation Run: it used tokens. */
const call = async ({ auth, llm }: GenerationDeps, request: GenerationRequest, plan: Plan) => {
  const record = (model: string, tokens: number, cost: number) =>
    auth.recordGenerationRun({ requestId: request.id, model, promptTemplateVersion: plan.templateVersion, inputs: plan.inputs, tokens, cost });
  try {
    const result = await llm.generate({ system: plan.system, prompt: plan.prompt, output: plan.output });
    const tokens = result.usage.inputTokens + result.usage.outputTokens;
    return { ok: true as const, run: await record(result.model, tokens, result.costUsd), output: result.output };
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    await record(error.model, error.usage.inputTokens + error.usage.outputTokens, error.costUsd);
    return { ok: false as const, error };
  }
};

const generate = async (deps: GenerationDeps, requestId: string, feedback: string | undefined) => {
  const { auth, jobs, config, now = () => new Date() } = deps;
  const [request] = await auth.rows("generationRequest", { id: requestId });
  if (!request || request.status !== "open") return;

  const pool = poolOf(request.kind);
  if (await isSpent(auth, config, pool, now())) return alertExhausted(auth, pool);

  const kind = KINDS.find((k) => k.name === request.kind);
  const plan = await kind?.plan(auth, request, feedback);
  if (!kind || !plan) return retry(deps, requestId, `no ${request.kind} can be generated for ${request.targetId}`);

  const result = await call(deps, request, plan);
  if (!result.ok) return retry(deps, requestId, result.error.message);

  await plan.write(result.output, result.run);
  await auth.setGenerationStatus(requestId, "in review");
  await jobs.enqueue(ContentReview, { requestId, runId: result.run.id });
};

export type ContentGeneration = {
  handlers: JobHandler[];
  /** One attempt at a request, as the `content.generate` handler runs it. */
  generate(payload: { requestId: string; feedback?: string }): Promise<void>;
  /** Re-enqueues every open request whose pool has budget again. Returns how many. */
  resumePaused(): Promise<number>;
};

/** Handles `content.generate` (content-approval.md#wiring). */
export const contentGeneration = (deps: GenerationDeps): ContentGeneration => ({
  handlers: [handler(ContentGenerate, ({ requestId, feedback }) => generate(deps, requestId, feedback))],
  generate: ({ requestId, feedback }) => generate(deps, requestId, feedback),
  async resumePaused() {
    const { auth, jobs, config, now = () => new Date() } = deps;
    const open = await auth.rows("generationRequest", { status: "open" });
    let resumed = 0;
    for (const request of open) {
      if (await isSpent(auth, config, poolOf(request.kind), now())) continue;
      await jobs.enqueue(ContentGenerate, { requestId: request.id });
      resumed++;
    }
    return resumed;
  },
});
