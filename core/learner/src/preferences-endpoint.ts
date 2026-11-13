import type { SessionResolver } from "@ibbun/auth";
import type { Learners } from "./learners.ts";

export const PREFERENCES_PATH = "/api/auth/preferences";

const reply = (status: number, message: string) => Response.json({ message }, { status });

/**
 * `GET` and `PUT /api/auth/preferences`: the Learner's own preferences, for `learner/client`.
 * A change needs the app's own origin, the same check Better Auth makes on its endpoints.
 */
export const handlePreferences = async (
  request: Request,
  { sessions, learners, appUrl }: { sessions: SessionResolver; learners: Learners; appUrl: string },
): Promise<Response> => {
  const reading = request.method === "GET";
  if (!reading && request.method !== "PUT") return reply(405, "method not allowed");
  if (!reading && request.headers.get("origin") !== appUrl) return reply(403, "wrong origin");
  const session = await sessions.resolve(request.headers);
  if (!session) return reply(401, "log in first");
  if (reading) return Response.json(await learners.preferences(session.learnerId));
  const change = await request.json().catch(() => null);
  try {
    return Response.json(await learners.changePreferences(session.learnerId, change));
  } catch {
    return reply(400, "those preferences are not valid");
  }
};
