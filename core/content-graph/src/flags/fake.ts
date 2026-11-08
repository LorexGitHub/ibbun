import type { Clock } from "../authoring/authoring.ts";
import { memoryStore } from "../authoring/store.ts";
import type { Graph } from "../graph.ts";
import { answerFlags, type AnswerFlags } from "./answer-flags.ts";

/** The answer-flag write over rows held in memory; it writes into `graph`. Same behaviour as Postgres (see the contract tests). */
export const createFakeAnswerFlags = (graph: Graph, clock?: Clock): AnswerFlags => answerFlags(memoryStore(graph), clock);
