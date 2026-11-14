import { BatchTextGenerate, ContentGenerate, ContentReview, PracticeGenerate } from "@ibbun/content-graph/jobs";
import type { Authoring, GenerationRequest } from "@ibbun/content-graph/authoring";
import { handler, type JobHandler, type Jobs } from "@ibbun/jobs";
import { LlmError, type Llm } from "@ibbun/llm";
import type { Progress, Texts } from "@ibbun/progress";
import type { LearnerId } from "@ibbun/shared";
import { KINDS } from "../kinds/index.ts";
import type { Plan } from "../kinds/kind.ts";
import { reasonOf, type BatchContext } from "../kinds/reading-passage/context.ts";
import { passageIdOf } from "../kinds/reading-passage/index.ts";
import { requestPracticeText } from "../kinds/practice-text/index.ts";
import { alertExhausted, isSpent, poolOf } from "./budget.ts";
import type { GenerationConfig } from "./config.ts";

export type GenerationDeps = {
  auth: Authoring;
  llm: Llm;
  /** Where `content.review` and the next attempt are enqueued. */
  jobs: Jobs;
  /** The Learner's Reviews, Batch Texts and Practice Texts, for kinds written for one Learner. */
  progress: Progress;
  texts: Texts;
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

/** The claimed attempt. A crash gives the claim back, so the redelivered job can try again. */
const attempt = async (deps: GenerationDeps, request: GenerationRequest, plan: Plan) => {
  try {
    const result = await call(deps, request, plan);
    if (result.ok) await plan.write(result.output, result.run);
    return result;
  } catch (error) {
    await deps.auth.releaseGeneration(request.id);
    throw error;
  }
};

const generate = async (deps: GenerationDeps, requestId: string, feedback: string | undefined) => {
  const { auth, jobs, config, progress, texts, now = () => new Date() } = deps;
  const [request] = await auth.rows("generationRequest", { id: requestId });
  if (!request || request.status !== "open") return;

  const pool = poolOf(request.kind);
  if (await isSpent(auth, config, pool, now())) return alertExhausted(auth, pool);

  const kind = KINDS.find((k) => k.name === request.kind);
  const plan = await kind?.plan(auth, request, feedback, { progress, texts, now });
  if (!kind || !plan) return retry(deps, requestId, `no ${request.kind} can be generated for ${request.targetId}`);

  if (!(await auth.claimGeneration(requestId))) return;
  const result = await attempt(deps, request, plan);
  if (!result.ok) return retry(deps, requestId, result.error.message);

  await jobs.enqueue(ContentReview, { requestId, runId: result.run.id });
};

/** Opens the Generation Request for a Batch Text and starts its first attempt. Does nothing if the batch already has one. */
const requestBatchText = async ({ auth, jobs, texts }: GenerationDeps, context: BatchContext) => {
  const targetId = passageIdOf(context);
  if ((await texts.batchTexts(context.learnerId)).some((t) => t.passageId === targetId)) return;
  const request = await auth.requestGeneration({ targetId, kind: "batch-text", reason: reasonOf(context) });
  await jobs.enqueue(ContentGenerate, { requestId: request.id });
};

export type ContentGeneration = {
  handlers: JobHandler[];
  /** One attempt at a request, as the `content.generate` handler runs it. */
  generate(payload: { requestId: string; feedback?: string }): Promise<void>;
  /** Opens the Generation Request for a picked batch, as the `batch-text.generate` handler does. */
  requestBatchText(context: BatchContext): Promise<void>;
  /** Opens the Generation Request for a recorded Practice Text, as the `practice.generate` handler does. */
  requestPracticeText(payload: { learnerId: LearnerId; practiceTextId: string }): Promise<void>;
  /** Re-enqueues every open request whose pool has budget again. Returns how many. */
  resumePaused(): Promise<number>;
};

/** Handles `content.generate` (content-approval.md#wiring). */
export const contentGeneration = (deps: GenerationDeps): ContentGeneration => ({
  handlers: [
    handler(ContentGenerate, ({ requestId, feedback }) => generate(deps, requestId, feedback)),
    handler(BatchTextGenerate, (context) => requestBatchText(deps, context)),
    handler(PracticeGenerate, (payload) => requestPracticeText(deps, payload)),
  ],
  generate: ({ requestId, feedback }) => generate(deps, requestId, feedback),
  requestBatchText: (context) => requestBatchText(deps, context),
  requestPracticeText: (payload) => requestPracticeText(deps, payload),
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
