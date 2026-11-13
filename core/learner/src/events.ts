import type { LearnerId } from "@ibbun/shared";
import type { Role } from "@ibbun/auth";

/**
 * An auth event, logged with the Learner ID and IP (accounts.md#security-standards).
 * Never carries a password, token, session ID or email.
 */
export type AuthEvent =
  | { type: "signed-up"; learnerId: LearnerId; ip: string | null }
  | { type: "logged-in"; learnerId: LearnerId; ip: string | null }
  | { type: "login-failed"; ip: string | null }
  | { type: "password-reset"; learnerId: LearnerId; ip: string | null }
  | { type: "deleted"; learnerId: LearnerId; ip: string | null }
  | { type: "role-changed"; learnerId: LearnerId; role: Role }
  | { type: "deactivated"; learnerId: LearnerId }
  | { type: "reactivated"; learnerId: LearnerId };

export type AuthLog = (event: AuthEvent) => void;

export const consoleAuthLog: AuthLog = (event) =>
  console.info(JSON.stringify({ at: new Date().toISOString(), auth: event }));
