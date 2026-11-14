import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { LearnerId } from "@ibbun/shared";
import { createAuthGuards, createFakeSessionResolver, type AuthEnv, type LearnerSession } from "./index.ts";

const learner: LearnerSession = { learnerId: LearnerId.parse("4f1c2a3e-0000-4000-8000-000000000001"), role: "learner" };
const supervisor: LearnerSession = { learnerId: LearnerId.parse("4f1c2a3e-0000-4000-8000-000000000002"), role: "supervisor" };

const appWith = () => {
  const sessions = createFakeSessionResolver();
  const { requireLearner, requireRole } = createAuthGuards(sessions);
  const app = new Hono<AuthEnv>();
  app.get("/me", requireLearner(), (c) => c.json(c.get("learner")));
  app.get("/admin", requireRole("supervisor"), (c) => c.json(c.get("learner")));
  app.get("/learners-only", requireRole("learner"), (c) => c.json(c.get("learner")));
  return { app, sessions };
};

describe("requireLearner", () => {
  it("answers 401 without a session", async () => {
    const { app } = appWith();
    expect((await app.request("/me")).status).toBe(401);
  });

  it("answers 401 for a session the resolver does not know", async () => {
    const { app } = appWith();
    expect((await app.request("/me", { headers: { cookie: "session=forged" } })).status).toBe(401);
  });

  it("passes the Learner's session to the route", async () => {
    const { app, sessions } = appWith();
    const res = await app.request("/me", { headers: sessions.signIn(learner) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(learner);
  });

  it("answers 401 once the session has ended", async () => {
    const { app, sessions } = appWith();
    const headers = sessions.signIn(learner);
    sessions.signOut(headers);
    expect((await app.request("/me", { headers })).status).toBe(401);
  });
});

describe("requireRole", () => {
  it("answers 401 without a session", async () => {
    const { app } = appWith();
    expect((await app.request("/admin")).status).toBe(401);
  });

  it("answers 403 for a Learner on a supervisor route", async () => {
    const { app, sessions } = appWith();
    expect((await app.request("/admin", { headers: sessions.signIn(learner) })).status).toBe(403);
  });

  it("lets a Supervisor through a supervisor route", async () => {
    const { app, sessions } = appWith();
    const res = await app.request("/admin", { headers: sessions.signIn(supervisor) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(supervisor);
  });

  it("lets a Supervisor through a learner route, because a Supervisor is also a Learner", async () => {
    const { app, sessions } = appWith();
    expect((await app.request("/learners-only", { headers: sessions.signIn(supervisor) })).status).toBe(200);
  });
});
