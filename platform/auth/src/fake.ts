import { randomUUID } from "node:crypto";
import type { LearnerSession, SessionResolver } from "./session.ts";

const COOKIE = "fake_session";

export interface FakeSessionResolver extends SessionResolver {
  /** Starts a session and returns the headers a request needs to carry it. */
  signIn(session: LearnerSession): Headers;
  /** Ends the session these headers carry. */
  signOut(headers: Headers): void;
}

const tokenOf = (headers: Headers) =>
  headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === COOKIE)?.[1];

/** A SessionResolver for slice tests: sessions live in memory, keyed by a cookie. */
export const createFakeSessionResolver = (): FakeSessionResolver => {
  const sessions = new Map<string, LearnerSession>();
  return {
    async resolve(headers) {
      return sessions.get(tokenOf(headers) ?? "") ?? null;
    },
    signIn(session) {
      const token = randomUUID();
      sessions.set(token, session);
      return new Headers({ cookie: `${COOKIE}=${token}` });
    },
    signOut(headers) {
      sessions.delete(tokenOf(headers) ?? "");
    },
  };
};
