import { describe, expect, it } from "vitest";
import { useLearnerDb } from "./db.testing.ts";
import { addLearner, createLearners } from "./learners.ts";
import { verifyPassword } from "./password.ts";
import { grantSupervisor, seedAccounts } from "./seed.ts";
import * as t from "../db/learner-tables.ts";
import { eq } from "drizzle-orm";

const pg = useLearnerDb();
const devEnv = { SEED_LEARNER_PASSWORD: "learner passphrase 1", SEED_SUPERVISOR_PASSWORD: "supervisor passphrase 1" };

const passwordOf = async (email: string) => {
  const [row] = await pg.db
    .select({ hash: t.loginMethods.password })
    .from(t.loginMethods)
    .innerJoin(t.learners, eq(t.learners.id, t.loginMethods.learnerId))
    .where(eq(t.learners.email, email));
  return row?.hash ?? null;
};

describe("seedAccounts", () => {
  it("creates the verified dev accounts with their roles and passwords, and running it again changes nothing", async () => {
    const learners = createLearners(pg.db, () => undefined);
    await seedAccounts(pg.db, learners, devEnv);
    const before = await pg.db.select().from(t.learners);
    await seedAccounts(pg.db, learners, devEnv);
    expect(await pg.db.select().from(t.learners)).toEqual(before);

    const learner = before.find((l) => l.email === "learner@ibbun.test");
    const supervisor = before.find((l) => l.email === "supervisor@ibbun.test");
    expect(learner).toMatchObject({ role: "learner", emailVerified: true });
    expect(supervisor).toMatchObject({ role: "supervisor", emailVerified: true });
    expect(await verifyPassword({ hash: (await passwordOf("learner@ibbun.test"))!, password: devEnv.SEED_LEARNER_PASSWORD })).toBe(true);
    expect(
      await verifyPassword({ hash: (await passwordOf("supervisor@ibbun.test"))!, password: devEnv.SEED_SUPERVISOR_PASSWORD }),
    ).toBe(true);
  });

  it("refuses to create the dev accounts in production, but still promotes SUPERVISOR_EMAIL", async () => {
    const { db } = pg;
    await db.delete(t.learners);
    const owner = await addLearner(db, { email: "owner@example.test", emailVerified: true });
    const learners = createLearners(db, () => undefined);
    const report = await seedAccounts(db, learners, { ...devEnv, NODE_ENV: "production", SUPERVISOR_EMAIL: "Owner@example.test" });
    expect(report).toEqual(["dev accounts: refused in production", "owner@example.test: supervisor"]);
    expect((await db.select().from(t.learners)).map((l) => l.email)).toEqual(["owner@example.test"]);
    expect((await learners.get(owner.id))?.role).toBe("supervisor");
  });

  it("needs both dev passwords outside production", async () => {
    const learners = createLearners(pg.db, () => undefined);
    await expect(seedAccounts(pg.db, learners, { SEED_LEARNER_PASSWORD: "x".repeat(12) })).rejects.toThrow(
      "SEED_SUPERVISOR_PASSWORD",
    );
    await expect(seedAccounts(pg.db, learners, { SEED_SUPERVISOR_PASSWORD: "x".repeat(12) })).rejects.toThrow(
      "SEED_LEARNER_PASSWORD",
    );
  });

  it("reports a SUPERVISOR_EMAIL that has no account yet, and creates none", async () => {
    const learners = createLearners(pg.db, () => undefined);
    const report = await seedAccounts(pg.db, learners, { NODE_ENV: "production", SUPERVISOR_EMAIL: "later@example.test" });
    expect(report).toContain("later@example.test: no account yet; sign up, then run the seed again");
    expect(await learners.findByEmail("later@example.test")).toBeNull();
  });
});

describe("grantSupervisor", () => {
  it("makes the account a Supervisor and logs the change", async () => {
    const events: unknown[] = [];
    const learners = createLearners(pg.db, (e) => void events.push(e));
    const added = await addLearner(pg.db, { email: "grant-me@example.test" });
    await grantSupervisor(learners, "GRANT-ME@example.test");
    expect((await learners.get(added.id))?.role).toBe("supervisor");
    expect(events).toEqual([{ type: "role-changed", learnerId: added.id, role: "supervisor" }]);
  });

  it("refuses an email without an account", async () => {
    const learners = createLearners(pg.db, () => undefined);
    await expect(grantSupervisor(learners, "nobody@example.test")).rejects.toThrow("no account for nobody@example.test");
  });
});
