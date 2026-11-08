import type { Rec } from "../src/drafts.ts";
import { newSample, openFor, type Context } from "./context.ts";
import { draw } from "./rules.ts";

/** One approval the reviewer wants to make, as the sampler sees it. */
export type Approval = {
  kind: "example" | "japanese-explanation" | "grammar-fields";
  /** The reviewer's model and rubric version: a change in either starts a calibration run. */
  model: string;
  rubricVersion: string;
  primary: Rec;
  unit: Rec[];
  requestId: string;
};

/**
 * The reviewer approved a draft. Returns `hold` when its kind is paused (the draft then waits for the supervisor,
 * who sees it as a `held` sample) and `approve` otherwise, after drawing the approval for a spot-check.
 */
export const admit = async (c: Context, approval: Approval): Promise<"approve" | "hold"> => {
  const { kind, model, rubricVersion, primary, unit, requestId } = approval;
  const state = await c.store.state(kind);
  const reviewer = { model, rubricVersion, requestId };
  if (state.paused) {
    if (!(await openFor(c, primary.id))) await c.store.add(newSample(c, { kind, reason: "held", primary, unit, ...reviewer }));
    return "hold";
  }
  const drawn = draw(state, `${model}/${rubricVersion}`, c.config, c.random);
  await c.store.saveState(drawn.state);
  if (drawn.reason) await c.store.add(newSample(c, { kind, reason: drawn.reason, primary, unit, ...reviewer }));
  return "approve";
};
