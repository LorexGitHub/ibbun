import { Hono } from "hono";
import { createContentGraph } from "@ibbun/content-graph";
import { transaction } from "@ibbun/db";
import { createProgress } from "@ibbun/progress";
import type { ServerContext, ServerPart } from "@ibbun/slice";
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
