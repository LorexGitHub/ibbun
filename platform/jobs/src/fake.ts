import type { z } from "zod";
import type { JobContract, JobHandler, Jobs } from "./contract.ts";

export interface FakeJobs extends Jobs {
  /** Runs every queued job that has a handler, including jobs those handlers enqueue. Rejects with the first handler error. */
  drain(): Promise<void>;
  /** Names of the jobs still waiting, oldest first. */
  pending(): string[];
  /** The schedules registered, by job name. */
  schedules(): Map<string, string>;
  /** Queues the scheduled job now, as the real queue would when its cron time comes. */
  fire(name: string): Promise<void>;
}

export const createFakeJobs = (): FakeJobs => {
  const handlers = new Map<string, JobHandler>();
  let queue: { contract: JobContract; payload: unknown }[] = [];
  const scheduled = new Map<string, { contract: JobContract; cron: string; payload: unknown }>();

  return {
    async enqueue<S extends z.ZodType>(contract: JobContract<S>, payload: z.input<S>) {
      queue.push({ contract, payload: contract.payload.parse(payload) });
    },
    async schedule<S extends z.ZodType>(contract: JobContract<S>, cron: string, payload: z.input<S>) {
      scheduled.set(contract.name, { contract, cron, payload: contract.payload.parse(payload) });
    },
    schedules: () => new Map([...scheduled].map(([name, s]) => [name, s.cron])),
    async fire(name) {
      const s = scheduled.get(name);
      if (!s) throw new Error(`no schedule for ${name}`);
      queue.push({ contract: s.contract, payload: s.payload });
    },
    async work(list) {
      for (const h of list) handlers.set(h.contract.name, h);
    },
    async stop() {
      handlers.clear();
    },
    async drain() {
      for (;;) {
        const next = queue.find((job) => handlers.has(job.contract.name));
        if (!next) return;
        queue = queue.filter((job) => job !== next);
        await handlers.get(next.contract.name)!.handle(next.payload);
      }
    },
    pending: () => queue.map((job) => job.contract.name),
  };
};
