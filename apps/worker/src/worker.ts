import type { Jobs } from "@mojibun/jobs";
import { checkSlices, loadServerParts, type ServerContext, type Slice } from "@mojibun/slice";

/** Hands every slice's job handlers to the queue and starts the schedules they carry. Returns the job names being worked. */
export const startWorker = async (jobs: Jobs, slices: Slice[], ctx: ServerContext): Promise<string[]> => {
  const handlers = (await loadServerParts(checkSlices(slices), ctx)).flatMap(({ part }) => part.jobs ?? []);
  await jobs.work(handlers);
  for (const { contract, schedule } of handlers) if (schedule) await jobs.schedule(contract, schedule.cron, schedule.payload);
  return handlers.map((h) => h.contract.name);
};
