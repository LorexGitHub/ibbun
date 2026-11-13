import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@ibbun/db";
import { LearnerId, StudyItemId } from "@ibbun/shared";
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
  async exists(target, tx: DbOrTx = db) {
    const match = "exampleId" in target ? sql`${reviews.detail}->>'exampleId' = ${target.exampleId}` : eq(reviews.studyItemId, target.studyItemId);
    return (await tx.select({ id: reviews.id }).from(reviews).where(match).limit(1)).length > 0;
  },
});

/** Progress backed by the `progress` schema. */
export const createProgress = (db: Db): Progress => createProgressOver(postgresStore(db), randomUUID);
