import type { DbOrTx } from "@ibbun/db";
import type { Clock } from "../authoring/authoring.ts";
import { postgresStore } from "../authoring/store.ts";
import { answerFlags, type AnswerFlags } from "./answer-flags.ts";

export type { AnswerFlags, NewAnswerFlag } from "./answer-flags.ts";

/** The `content-graph/flags` interface over Postgres: what Learner-facing slices may queue for Content Approval. */
export const createAnswerFlags = (db: DbOrTx, clock?: Clock): AnswerFlags => answerFlags(postgresStore(db), clock);
