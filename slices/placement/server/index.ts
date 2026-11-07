import { Hono } from "hono";
import { createContentGraph } from "@mojibun/content-graph";
import { transaction } from "@mojibun/db";
import { createProgress } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createPlacementApi } from "./routes.ts";

export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => {
  const placement = createPlacementApi({
    graph: createContentGraph(db),
    progress: createProgress(db),
    sessions,
    transact: (work) => transaction(db, work),
  });
  return { api: new Hono().route("/", placement) };
};
