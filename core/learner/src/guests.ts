import { and, eq, lt } from "drizzle-orm";
import type { DbOrTx } from "@ibbun/db";
import { LearnerId } from "@ibbun/shared";
import * as t from "../db/learner-tables.ts";

/** A guest lives this long. Each guest login deletes the ones older, so the stage needs no Scheduler. */
export const GUEST_MAX_AGE_HOURS = 24;

/** Deletes guests older than the limit with their sessions and preferences. Returns their ids. */
export const purgeGuests = async (db: DbOrTx, now: Date): Promise<LearnerId[]> => {
  const cutoff = new Date(now.getTime() - GUEST_MAX_AGE_HOURS * 3600_000);
  const rows = await db
    .delete(t.learners)
    .where(and(eq(t.learners.isAnonymous, true), lt(t.learners.createdAt, cutoff)))
    .returning({ id: t.learners.id });
  return rows.map((r) => LearnerId.parse(r.id));
};
