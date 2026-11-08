import type { Jobs } from "@mojibun/jobs";

/** The queue connects on the first enqueue, so the worker, which loads every slice, never needs it for Learn. */
export const lazyEnqueue = (url: string | undefined, connect: (url: string) => Promise<Jobs>): Pick<Jobs, "enqueue"> => {
  let queue: Promise<Jobs> | undefined;
  return {
    enqueue: async (contract, payload) => {
      if (!url) throw new Error("DATABASE_URL is not set");
      return (await (queue ??= connect(url))).enqueue(contract, payload);
    },
  };
};
