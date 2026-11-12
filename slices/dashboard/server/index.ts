import { createContentGraph } from "@mojibun/content-graph";
import { createLearners } from "@mojibun/learner";
import { createProgress } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createDashboardApi } from "./api.ts";

export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => {
  const learners = createLearners(db);
  return {
    api: createDashboardApi({
      sessions,
      progress: createProgress(db),
      contentGraph: createContentGraph(db),
      batchSize: async (learnerId) => (await learners.preferences(learnerId)).batchSize,
    }),
  };
};
