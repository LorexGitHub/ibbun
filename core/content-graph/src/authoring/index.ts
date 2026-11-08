import type { DbOrTx } from "@mojibun/db";
import { authoring, type Authoring, type Clock } from "./authoring.ts";
import { postgresStore } from "./store.ts";

export { DERIVED_LINK_TABLES, MAX_ATTEMPTS } from "./authoring.ts";
export type { ApprovalDecision, Authoring, Clock, Decision, DerivedLinkTable, GenerationRequest, GenerationRun, NewQueueEntry, QueueEntry, QueueFilter, RecordTable } from "./authoring.ts";
export type { Row, TableName, Where } from "./store.ts";
export * from "./schema.ts";
export * from "./snapshot/types.ts";

/** The authoring interface over Postgres. Pass a transaction to join a slice's own. */
export const createAuthoring = (db: DbOrTx, clock?: Clock): Authoring => authoring(postgresStore(db), clock);
export * from "./checks/index.ts";
export * from "../fixture/index.ts";
