import type { JobHandler, Jobs } from "@ibbun/jobs";
import { checkSlices, loadServerParts, type ServerContext, type Slice } from "@ibbun/slice";

/** Every slice's job handlers, as both the local worker and the worker Lambda run them. */
export const jobHandlers = async (slices: Slice[], ctx: ServerContext): Promise<JobHandler[]> =>
  (await loadServerParts(checkSlices(slices), ctx)).flatMap(({ part }) => part.jobs ?? []);

/** Hands every slice's job handlers to the queue and starts the schedules they carry. Returns the job names being worked. */
export const startWorker = async (jobs: Jobs, slices: Slice[], ctx: ServerContext): Promise<string[]> => {
  const handlers = await jobHandlers(slices, ctx);
  await jobs.work(handlers);
  for (const { contract, schedule } of handlers) if (schedule) await jobs.schedule(contract, schedule.cron, schedule.payload);
  return handlers.map((h) => h.contract.name);
};
