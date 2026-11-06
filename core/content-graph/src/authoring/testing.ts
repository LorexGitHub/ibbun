import type { Graph } from "../graph.ts";
import { authoring, type Authoring, type Clock } from "./authoring.ts";
import { memoryStore } from "./store.ts";

/** The authoring interface over rows held in memory; it writes into `graph`. Same behaviour as Postgres (see the contract tests). */
export const createFakeAuthoring = (graph: Graph, clock?: Clock): Authoring => authoring(memoryStore(graph), clock);
