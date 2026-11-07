import type { z } from "zod";
import type { Authoring, GenerationRequest, GenerationRun } from "@mojibun/content-graph/authoring";
import type { Progress, Texts } from "@mojibun/progress";

/** What one LLM call for a request needs, and what to do with the answer. */
export type Plan<S extends z.ZodType = z.ZodType> = {
  /** Changes whenever the system prompt or the wording of the prompt does; kept on the Generation Run and the Provenance. */
  readonly templateVersion: string;
  readonly system: string;
  readonly prompt: string;
  /** The shape the answer must have; the model is constrained to it and the answer is parsed with it. */
  readonly output: S;
  /** Every text placed in the prompt, kept on the Generation Run. */
  readonly inputs: unknown[];
  /** Writes the answer as Drafts with generated Provenance pointing at `run` and listing every record in the prompt as an input. */
  write(output: z.output<S>, run: GenerationRun): Promise<void>;
};

/** Types `write` by the plan's own output shape. The answer reaching it was parsed with `output`, so the cast holds. */
export const definePlan = <S extends z.ZodType>(plan: Plan<S>): Plan => plan as unknown as Plan;

/** What a Learner-aware kind reads besides the Content Graph. */
export type Services = { progress: Progress; texts: Texts; now: () => Date };

/**
 * A kind of generated content. Each lives in `kinds/<kind>/` and is listed in `kinds/index.ts`;
 * the request's `kind` picks it.
 */
export type Kind = {
  /** The Generation Request `kind` this generates for. */
  readonly name: string;
  /** Null when the request's target is gone or can't have this kind. */
  plan(auth: Authoring, request: GenerationRequest, feedback: string | undefined, services: Services): Promise<Plan | null>;
};
