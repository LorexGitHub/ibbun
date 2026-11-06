import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Db, DbOrTx } from "@mojibun/db";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import { reviews } from "../db/progress-tables.ts";
import { createProgressOver, type Progress, type ReviewStore } from "./progress.ts";
import { ReviewDetail, ReviewKind, type Review } from "./review.ts";

const toReview = (row: typeof reviews.$inferSelect): Review => ({
  ...ReviewDetail.parse(row.detail),
  id: row.id,
  learnerId: LearnerId.parse(row.learnerId),
  studyItemId: StudyItemId.parse(row.studyItemId),
  kind: ReviewKind.parse(row.kind),
  passed: row.passed,
  at: row.at.toISOString(),
});

const postgresStore = (db: Db): ReviewStore => ({
  async append({ id, learnerId, studyItemId, kind, passed, at, ...detail }, tx: DbOrTx = db) {
    await tx.insert(reviews).values({ id, learnerId, studyItemId, kind, passed, at: new Date(at), detail });
  },
  async read(learnerId, studyItemId, tx: DbOrTx = db) {
    const forItem = studyItemId ? eq(reviews.studyItemId, studyItemId) : undefined;
    const rows = await tx
      .select()
      .from(reviews)
      .where(and(eq(reviews.learnerId, learnerId), forItem))
      .orderBy(asc(reviews.at), asc(reviews.seq));
    return rows.map(toReview);
  },
});

/** Progress backed by the `progress` schema. */
export const createProgress = (db: Db): Progress => createProgressOver(postgresStore(db), randomUUID);
