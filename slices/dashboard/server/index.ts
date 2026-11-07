import { createContentGraph } from "@mojibun/content-graph";
import { createProgress } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createDashboardApi } from "./api.ts";

export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => ({
  api: createDashboardApi({ sessions, progress: createProgress(db), contentGraph: createContentGraph(db) }),
});
