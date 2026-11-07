import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@mojibun/db";
import { kindState, sample } from "../db/tables.ts";
import { freshState, type Sample, type SamplingStore } from "./types.ts";

const toSample = (row: typeof sample.$inferSelect): Sample => ({
  id: row.id,
  kind: row.kind,
  reason: row.reason,
  status: row.status,
  primary: { table: row.primaryTable, id: row.primaryId },
  unit: row.unit,
  decisionId: row.decisionId,
  requestId: row.requestId,
  model: row.model,
  rubricVersion: row.rubricVersion,
  note: row.note,
  at: row.at,
  settledAt: row.settledAt,
});

/** The sampling store over the `content_approval` schema. */
export const createPostgresStore = (db: Db): SamplingStore => ({
  async state(kind) {
    const [row] = await db.select().from(kindState).where(eq(kindState.kind, kind));
    return row ? { kind, version: row.version, calibrationLeft: row.calibrationLeft, paused: row.paused, resumedAt: row.resumedAt, cursor: row.cursor } : freshState(kind);
  },
  async saveState(state) {
    await db.insert(kindState).values(state).onConflictDoUpdate({ target: kindState.kind, set: state });
  },
  async add(s) {
    await db.insert(sample).values({ ...s, primaryTable: s.primary.table, primaryId: s.primary.id });
  },
  async get(id) {
    const [row] = await db.select().from(sample).where(eq(sample.id, id));
    return row && toSample(row);
  },
  async list({ status, kind } = {}) {
    const where = and(status && eq(sample.status, status), kind && eq(sample.kind, kind));
    return (await db.select().from(sample).where(where).orderBy(asc(sample.at))).map(toSample);
  },
  async settle(id, status, note, at) {
    await db.update(sample).set({ status, note, settledAt: at }).where(eq(sample.id, id));
  },
});
