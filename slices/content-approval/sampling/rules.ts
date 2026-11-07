import type { SamplingConfig } from "./config.ts";
import type { KindState, Sample } from "./types.ts";

export type Draw = { state: KindState; reason: "calibration" | "random" | null };

/**
 * Decides whether an approval made under `version` is sampled. A new version starts a calibration run in which
 * every approval is sampled; afterwards a random `sampleRate` of them are.
 */
export const draw = (state: KindState, version: string, config: SamplingConfig, random: () => number): Draw => {
  const current = state.version === version ? state : { ...state, version, calibrationLeft: config.calibration };
  if (current.calibrationLeft > 0) return { state: { ...current, calibrationLeft: current.calibrationLeft - 1 }, reason: "calibration" };
  return { state: current, reason: random() < config.sampleRate ? "random" : null };
};

/** Only calibration and random samples measure the reviewer; held and re-reviewed ones are chosen, not drawn. */
const counts = (s: Sample, since: Date | null) =>
  (s.reason === "calibration" || s.reason === "random") && s.status !== "pending" && s.settledAt !== null && (!since || s.settledAt > since);

/** The latest verdicts, newest last, of the drawn samples the supervisor has settled since the kind was resumed. */
export const latestVerdicts = (samples: Sample[], state: KindState, window: number): boolean[] =>
  samples
    .filter((s) => counts(s, state.resumedAt))
    .sort((a, b) => a.settledAt!.getTime() - b.settledAt!.getTime())
    .slice(-window)
    .map((s) => s.status === "rejected");

export const errorRate = (rejections: boolean[]): number => (rejections.length ? rejections.filter(Boolean).length / rejections.length : 0);

export const exceedsThreshold = (rejections: boolean[], config: SamplingConfig): boolean => errorRate(rejections) > config.errorThreshold;
