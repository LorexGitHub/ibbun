import type { Db, Tx } from "./client.ts";

/** Runs `work` in one transaction: commits if it resolves, rolls back if it throws. */
export const transaction = <T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> =>
  db.transaction(work);
