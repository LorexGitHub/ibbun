import type { Authoring } from "@ibbun/content-graph/authoring";
import { ContentGenerate } from "@ibbun/content-graph/jobs";
import type { Jobs } from "@ibbun/jobs";

/** One rejection in the run uses the request's one attempt; the reasons go to the generator as feedback. */
export const retry = async (d: { authoring: Authoring; jobs: Jobs }, requestId: string, reasons: string[]) => {
  const request = await d.authoring.failAttempt(requestId);
  if (request.status === "open") await d.jobs.enqueue(ContentGenerate, { requestId, feedback: reasons.join("\n") });
};
