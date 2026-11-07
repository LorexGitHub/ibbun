import type { Jobs } from "@mojibun/jobs";
import { checkSlices, loadServerParts, type ServerContext, type Slice } from "@mojibun/slice";

/** Hands every slice's job handlers to the queue and starts their schedules. Returns the job names being worked. */
export const startWorker = async (jobs: Jobs, slices: Slice[], ctx: ServerContext): Promise<string[]> => {
  const parts = (await loadServerParts(checkSlices(slices), ctx)).map(({ part }) => part);
  const handlers = parts.flatMap((part) => part.jobs ?? []);
  await jobs.work(handlers);
  for (const part of parts) for (const { contract, cron, payload } of part.schedules ?? []) await jobs.schedule(contract, cron, payload);
  return handlers.map((h) => h.contract.name);
};
