import { randomUUID } from "node:crypto";
import type { Authoring } from "@ibbun/content-graph/authoring";
import type { Jobs } from "@ibbun/jobs";
import type { Progress } from "@ibbun/progress";
import type { SamplingConfig } from "./config.ts";
import type { Sample, SamplingStore } from "./types.ts";

export type SamplingDeps = {
  store: SamplingStore;
  authoring: Authoring;
  progress: Progress;
  jobs: Jobs;
  config: SamplingConfig;
  random?: () => number;
  now?: () => Date;
};

/** What every sampling operation works with: the dependencies, with the clock and the dice filled in. */
export type Context = Required<SamplingDeps>;

export const contextOf = (deps: SamplingDeps): Context => ({ random: Math.random, now: () => new Date(), ...deps });

type Fields = Pick<Sample, "kind" | "reason" | "primary" | "unit"> & Partial<Sample>;

/** A pending sample made now. */
export const newSample = (c: Context, fields: Fields): Sample => ({
  id: randomUUID(),
  status: "pending",
  decisionId: null,
  requestId: null,
  model: null,
  rubricVersion: null,
  note: null,
  at: c.now(),
  settledAt: null,
  ...fields,
});

/** The pending sample already waiting on this record, if any. */
export const openFor = async (c: Context, primaryId: string): Promise<Sample | undefined> =>
  (await c.store.list({ status: "pending" })).find((s) => s.primary.id === primaryId);
