import { createContentGraph } from "@ibbun/content-graph";
import { createLearners } from "@ibbun/learner";
import { createProgress } from "@ibbun/progress";
import type { ServerContext, ServerPart } from "@ibbun/slice";
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
