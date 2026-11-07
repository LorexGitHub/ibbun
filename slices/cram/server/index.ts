import { Hono } from "hono";
import { createContentGraph } from "@mojibun/content-graph";
import { createProgress } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createCramApi } from "./api.ts";

/** Mounted at `/api/cram`. Wrapped in a plain Hono so the shell sees a route table, not Cram's auth variables. */
export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => ({
  api: new Hono().route("/", createCramApi({ contentGraph: createContentGraph(db), progress: createProgress(db), sessions, now: () => new Date() })),
});
