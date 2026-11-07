import { admit, type Approval } from "./admit.ts";
import { sweepClips } from "./clips.ts";
import { contextOf, type SamplingDeps } from "./context.ts";
import { reReview, type ReReviewFilter } from "./re-review.ts";
import { errorRate, latestVerdicts } from "./rules.ts";
import { SAMPLE_KINDS, type KindState, type SampleKind } from "./types.ts";
import { resume, verdict } from "./verdict.ts";

export type { Approval, ReReviewFilter, SamplingDeps };

export type KindReport = { kind: SampleKind; paused: boolean; calibrationLeft: number; sampled: number; errorRate: number };

/** Spot-check sampling: draws samples from the reviewer's approvals, keeps the error rates and the pauses, and acts on the supervisor's verdicts. */
export const createSampling = (deps: SamplingDeps) => {
  const c = contextOf(deps);
  const states = (): Promise<KindState[]> => Promise.all(SAMPLE_KINDS.map((kind) => c.store.state(kind)));

  /** Per kind: the pause, calibration still to go and the running error rate over the latest verdicts. */
  const reports = async (): Promise<KindReport[]> =>
    Promise.all(
      (await states()).map(async (state) => {
        const verdicts = latestVerdicts(await c.store.list({ kind: state.kind }), state, c.config.errorWindow);
        return { kind: state.kind, paused: state.paused, calibrationLeft: state.calibrationLeft, sampled: verdicts.length, errorRate: errorRate(verdicts) };
      }),
    );

  return {
    admit: (approval: Approval) => admit(c, approval),
    verdict: (id: string, decision: "confirm" | "reject", note?: string | null) => verdict(c, id, decision, note),
    resume: (kind: SampleKind) => resume(c, kind),
    reReview: (filter: ReReviewFilter) => reReview(c, filter),
    sweepClips: () => sweepClips(c),
    states,
    reports,
    samples: c.store.list,
    sample: c.store.get,
  };
};

export type Sampling = ReturnType<typeof createSampling>;
