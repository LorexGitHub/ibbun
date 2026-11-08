import { Hono } from "hono";
import { createContentGraph } from "@mojibun/content-graph";
import { createAnswerFlags } from "@mojibun/content-graph/flags";
import { createLearners } from "@mojibun/learner";
import { createProgress } from "@mojibun/progress";
import type { ServerContext, ServerPart } from "@mojibun/slice";
import { createFlagsApi } from "../flags/api.ts";
import { createReviewsApi } from "./api.ts";

export const createServerPart = ({ db, sessions }: ServerContext): ServerPart => ({
  api: new Hono()
    .route(
      "/",
      createReviewsApi({
        sessions,
        learners: createLearners(db),
        contentGraph: createContentGraph(db),
        progress: createProgress(db),
        now: () => new Date(),
      }),
    )
    .route("/", createFlagsApi({ sessions, progress: createProgress(db), answerFlags: createAnswerFlags(db) })),
});
