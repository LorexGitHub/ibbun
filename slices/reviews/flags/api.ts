import { Hono } from "hono";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { AnswerFlags } from "@mojibun/content-graph/flags";
import type { Progress, Review } from "@mojibun/progress";
import { FlagRequest, FLAGGABLE_FACETS } from "./contract.ts";

export type FlagsDeps = { sessions: SessionResolver; progress: Progress; answerFlags: AnswerFlags };

type Flaggable = { exampleId: string; input: string };

/** The wrong, typed input of a graded facet, or why it cannot be flagged. */
const flaggable = (review: Review, facet: string): Flaggable | { refusal: string } => {
  const graded = review.facets.find((f) => f.facet === facet);
  if (review.kind !== "srs" || !review.exampleId || !graded) return { refusal: "that facet was not graded" };
  if (!(FLAGGABLE_FACETS as readonly string[]).includes(facet)) return { refusal: "only Japanese answers can be flagged" };
  if (graded.outcome === "pass") return { refusal: "that answer was marked right" };
  if (review.revealed || !graded.rawInput.trim()) return { refusal: "there was no typed answer to flag" };
  return { exampleId: review.exampleId, input: graded.rawInput };
};

/**
 * "My answer was right": queues a graded facet for Content Approval with the input attached.
 * The Review log is append-only and is not touched, so the past Review is never regraded.
 */
export const createFlagsApi = ({ sessions, progress, answerFlags }: FlagsDeps) =>
  new Hono<AuthEnv>().use(createAuthGuards(sessions).requireLearner()).post("/flag", async (c) => {
    const { learnerId } = c.get("learner");
    const request = FlagRequest.safeParse(await c.req.json().catch(() => null));
    if (!request.success) return c.json({ message: "not a valid flag" }, 400);
    const { studyItemId, reviewId, facet } = request.data;

    const review = (await progress.log(learnerId, studyItemId)).find((r) => r.id === reviewId);
    if (!review) return c.json({ message: "no such Review" }, 404);
    const found = flaggable(review, facet);
    if ("refusal" in found) return c.json({ message: found.refusal }, 422);

    await answerFlags.flag({ exampleId: found.exampleId, reviewId, facet, input: found.input });
    return c.json({ flagged: true }, 201);
  });
