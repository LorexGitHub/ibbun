import type { MiddlewareHandler } from "hono";
import { holdsRole, type LearnerSession, type Role, type SessionResolver } from "./session.ts";

/** Routes behind a guard read the session with `c.get("learner")`. */
export type AuthEnv = { Variables: { learner: LearnerSession } };

/** Hono middleware that answers 401 without a session and 403 without the role. */
export const createAuthGuards = (sessions: SessionResolver) => {
  const requireRole =
    (role: Role): MiddlewareHandler<AuthEnv> =>
    async (c, next) => {
      const session = await sessions.resolve(c.req.raw.headers);
      if (!session) return c.json({ message: "log in first" }, 401);
      if (!holdsRole(session.role, role)) return c.json({ message: "not allowed" }, 403);
      c.set("learner", session);
      await next();
    };
  return { requireLearner: () => requireRole("learner"), requireRole };
};
