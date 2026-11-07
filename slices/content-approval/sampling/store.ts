import { freshState, type KindState, type Sample, type SamplingStore } from "./types.ts";

/** A sampling store held in memory; it passes the same contract as the Postgres one. */
export const createMemoryStore = (): SamplingStore => {
  const states = new Map<string, KindState>();
  const samples: Sample[] = [];
  return {
    async state(kind) {
      return structuredClone(states.get(kind) ?? freshState(kind));
    },
    async saveState(state) {
      states.set(state.kind, structuredClone(state));
    },
    async add(sample) {
      samples.push(structuredClone(sample));
    },
    async get(id) {
      return structuredClone(samples.find((s) => s.id === id));
    },
    async list({ status, kind } = {}) {
      return structuredClone(samples.filter((s) => (!status || s.status === status) && (!kind || s.kind === kind)).sort((a, b) => a.at.getTime() - b.at.getTime()));
    },
    async settle(id, status, note, at) {
      const sample = samples.find((s) => s.id === id);
      if (sample) Object.assign(sample, { status, note, settledAt: at });
    },
  };
};
