import type { LearnerId } from "@mojibun/shared";

/** Every account has exactly one role. A Supervisor is also a Learner. */
export type Role = "learner" | "supervisor";

/** Who is making a request. */
export type LearnerSession = { learnerId: LearnerId; role: Role };

/**
 * Finds the session a request carries. Core `learner` implements it; the api
 * shell passes that implementation in, so platform never imports core.
 */
export interface SessionResolver {
  /** The session the request's cookie points to, or null when there is none or it has ended. */
  resolve(headers: Headers): Promise<LearnerSession | null>;
}

/** Whether `role` may do what `required` may do. */
export const holdsRole = (role: Role, required: Role): boolean => role === required || role === "supervisor";
