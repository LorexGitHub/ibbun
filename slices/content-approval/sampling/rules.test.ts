import { describe, expect, it } from "vitest";
import { DEFAULT_SAMPLING } from "./config.ts";
import { draw, errorRate, exceedsThreshold, latestVerdicts } from "./rules.ts";
import { freshState, type KindState, type Sample } from "./types.ts";

const state = (over: Partial<KindState> = {}): KindState => ({ ...freshState("example"), ...over });
const never = () => 0.99;
const always = () => 0;

describe("draw", () => {
  it("samples every approval in the first 20 under a new version, then 5% at random", () => {
    let s = state();
    const reasons = [];
    for (let i = 0; i < 22; i++) {
      const d = draw(s, "opus/v1", DEFAULT_SAMPLING, never);
      reasons.push(d.reason);
      s = d.state;
    }
    expect(reasons.slice(0, 20)).toEqual(Array(20).fill("calibration"));
    expect(reasons.slice(20)).toEqual([null, null]);
    expect(draw(s, "opus/v1", DEFAULT_SAMPLING, always).reason).toBe("random");
    expect(draw(s, "opus/v1", DEFAULT_SAMPLING, () => 0.05).reason).toBeNull();
  });

  it("starts calibrating again when the version changes", () => {
    const settled = state({ version: "opus/v1", calibrationLeft: 0 });
    expect(draw(settled, "opus/v2", DEFAULT_SAMPLING, never)).toEqual({ state: state({ version: "opus/v2", calibrationLeft: 19 }), reason: "calibration" });
  });
});

const sample = (status: Sample["status"], reason: Sample["reason"], minute: number): Sample => ({
  id: String(minute),
  kind: "example",
  reason,
  status,
  primary: { table: "example", id: "e" },
  unit: [],
  decisionId: null,
  requestId: null,
  model: null,
  rubricVersion: null,
  note: null,
  at: new Date(0),
  settledAt: status === "pending" ? null : new Date(minute * 60_000),
});

describe("the running error rate", () => {
  it("looks at the latest settled drawn samples only, newest last", () => {
    const samples = [sample("rejected", "random", 3), sample("confirmed", "calibration", 1), sample("pending", "random", 2), sample("rejected", "held", 4), sample("rejected", "re-review", 5)];
    expect(latestVerdicts(samples, state(), 50)).toEqual([false, true]);
    expect(latestVerdicts(samples, state(), 1)).toEqual([true]);
  });

  it("ignores verdicts from before the kind was resumed", () => {
    const samples = [sample("rejected", "random", 1), sample("confirmed", "random", 5)];
    expect(latestVerdicts(samples, state({ resumedAt: new Date(2 * 60_000) }), 50)).toEqual([false]);
  });

  it("pauses only when more than 10% are rejected", () => {
    const of = (rejected: number, total: number) => Array.from({ length: total }, (_, i) => i < rejected);
    expect(errorRate(of(0, 0))).toBe(0);
    expect(exceedsThreshold(of(5, 50), DEFAULT_SAMPLING)).toBe(false);
    expect(exceedsThreshold(of(6, 50), DEFAULT_SAMPLING)).toBe(true);
  });
});
