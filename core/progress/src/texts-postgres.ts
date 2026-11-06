import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Db, DbOrTx } from "@mojibun/db";
import { texts } from "../db/progress-tables.ts";
import { createTextsOver, NewText, type Text, type Texts } from "./texts.ts";

const toText = (row: typeof texts.$inferSelect): Text => ({
  ...NewText.parse({ ...(row.detail as object), kind: row.kind, learnerId: row.learnerId, level: row.level, passageId: row.passageId, at: row.at.toISOString() }),
  id: row.id,
});

/** Texts backed by the `progress` schema. */
export const createTexts = (db: Db): Texts =>
  createTextsOver(
    {
      async append({ id, kind, learnerId, level, passageId, at, ...detail }, tx: DbOrTx = db) {
        await tx.insert(texts).values({ id, kind, learnerId, level, passageId, at: new Date(at), detail });
      },
      async read(learnerId, kind, tx: DbOrTx = db) {
        const rows = await tx
          .select()
          .from(texts)
          .where(and(eq(texts.learnerId, learnerId), eq(texts.kind, kind)))
          .orderBy(asc(texts.at), asc(texts.seq));
        return rows.map(toText);
      },
    },
    randomUUID,
  );
