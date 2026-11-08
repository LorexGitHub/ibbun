import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { ContentGraph } from "@mojibun/content-graph";
import type { Learners } from "@mojibun/learner";
import type { Progress } from "@mojibun/progress";
import { StudyItemId, type LearnerId } from "@mojibun/shared";
import { createClipReviewsApi } from "../listening/server/clip-reviews-api.ts";
import { SubmitRequest } from "../contract.ts";
import { facetsOf, pickExample } from "./prompt.ts";
import { createPrompts } from "./prompts.ts";
import { ghostsOf } from "../wrap-up/ghosts.ts";
import { pickDifferent } from "../wrap-up/pick.ts";
import { coversFacets, detailOf, regrade, responseOf, storedFacets } from "./regrade.ts";

export type ReviewsDeps = {
  sessions: SessionResolver;
  contentGraph: ContentGraph;
  progress: Progress;
  learners: Learners;
  now: () => Date;
  /** [0, 1), for shuffling a listening question's options. */
  random?: () => number;
};

/** The most Reviews one request hands out. */
export const DUE_LIMIT = 50;

export const createReviewsApi = ({ sessions, contentGraph, progress, learners, now, random = Math.random }: ReviewsDeps) => {
  const guards = createAuthGuards(sessions);
  const { requireLearner } = guards;
  const { promptThrough, withPreferences, locate } = createPrompts(contentGraph, learners);

  const prompt = async (learnerId: LearnerId, id: StudyItemId) => {
    const last = (await progress.log(learnerId, id)).findLast((r) => r.exampleId);
    return promptThrough(id, (examples) => pickExample(examples, last?.exampleId));
  };

  return new Hono<AuthEnv>()
    .use(requireLearner())
    .route("/listening", createClipReviewsApi({ contentGraph, progress, learners, guards, now, random }))
    .get("/due", async (c) => {
      const { learnerId } = c.get("learner");
      const due = (await progress.due(learnerId, now())).slice(0, DUE_LIMIT);
      const prompts = await Promise.all(due.map((id) => prompt(learnerId, id)));
      return c.json(await withPreferences(learnerId, prompts));
    })
    .get("/ghosts", async (c) => {
      const { learnerId } = c.get("learner");
      const ghosts = ghostsOf(await progress.log(learnerId), now());
      const prompts = await Promise.all(ghosts.map((g) => promptThrough(g.studyItemId, (examples) => examples.find((e) => e.id === g.exampleId))));
      return c.json(await withPreferences(learnerId, prompts));
    })
    .get("/wrap-up/:studyItemId", async (c) => {
      const { learnerId } = c.get("learner");
      const id = StudyItemId.safeParse(c.req.param("studyItemId"));
      if (!id.success) return c.json({ message: "no such Study Item" }, 404);
      const asked = c.req.queries("asked") ?? [];
      const asking = await promptThrough(id.data, (examples) => pickDifferent(examples, asked));
      if (!asking) return c.json({ message: "no such Review" }, 404);
      return c.json(await withPreferences(learnerId, [asking]));
    })
    .post("/answer", async (c) => {
      const { learnerId } = c.get("learner");
      const request = SubmitRequest.safeParse(await c.req.json().catch(() => null));
      if (!request.success) return c.json({ message: "not a valid answer" }, 400);
      const { kind, studyItemId, exampleId, facets, revealed } = request.data;
      if (kind === "srs" && !(await progress.due(learnerId, now())).includes(studyItemId)) {
        return c.json({ message: "that Review is not due; only the first answer counts" }, 409);
      }

      const found = await locate(studyItemId, exampleId);
      if (!found) return c.json({ message: "no such Review" }, 404);
      const expected = facetsOf(found.page, found.example);
      if (!coversFacets(expected, facets)) return c.json({ message: "answer every facet of the Review" }, 422);

      const results = regrade(expected, facets, revealed);
      if (!results) return c.json({ message: "that is not an answer yet" }, 422);
      const body = responseOf(results);
      await progress.record({
        learnerId,
        studyItemId,
        kind,
        passed: body.passed,
        at: now().toISOString(),
        exampleId,
        facets: storedFacets(results),
        ...detailOf(request.data),
      });
      return c.json(body);
    });
};
