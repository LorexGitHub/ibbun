import { PgBoss } from "pg-boss";
import type { z } from "zod";
import type { JobContract, Jobs } from "./contract.ts";

export const createPgBossJobs = async (
  connectionString: string,
  options: { max?: number } = {},
): Promise<Jobs> => {
  const boss = new PgBoss({ connectionString, schema: "jobs", max: options.max ?? 4 });
  boss.on("error", (error) => console.error("pg-boss:", error));
  await boss.start();
  const queues = new Map<string, Promise<void>>();
  const ensureQueue = (name: string) => {
    if (!queues.has(name)) queues.set(name, boss.createQueue(name));
    return queues.get(name)!;
  };

  return {
    async enqueue<S extends z.ZodType>(contract: JobContract<S>, payload: z.input<S>) {
      const data = contract.payload.parse(payload) as object;
      await ensureQueue(contract.name);
      await boss.send(contract.name, data);
    },
    async work(handlers) {
      for (const { contract, handle } of handlers) {
        await ensureQueue(contract.name);
        await boss.work(contract.name, async (jobs) => {
          for (const job of jobs) await handle(contract.payload.parse(job.data));
        });
      }
    },
    stop: () => boss.stop({ graceful: true }),
  };
};
