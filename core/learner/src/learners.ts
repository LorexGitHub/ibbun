import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Role } from "@mojibun/auth";
import type { Db, DbOrTx } from "@mojibun/db";
import { LearnerId } from "@mojibun/shared";
import * as t from "../db/learner-tables.ts";
import { consoleAuthLog, type AuthLog } from "./events.ts";
import { changePreferences, DEFAULT_PREFERENCES, type Preferences } from "./preferences.ts";

export type Learner = {
  id: LearnerId;
  email: string;
  role: Role;
  /** A deactivated Learner can't log in. Their data stays. */
  deactivated: boolean;
  createdAt: Date;
};

/** Identity, role and preference reads and writes. Every write accepts an optional transaction. */
export interface Learners {
  get(id: LearnerId, tx?: DbOrTx): Promise<Learner | null>;
  findByEmail(email: string, tx?: DbOrTx): Promise<Learner | null>;
  /** Logged. There is no screen for this: the seed and `grant-supervisor` call it. */
  setRole(id: LearnerId, role: Role, tx?: DbOrTx): Promise<void>;
  /** Logged. Deactivating ends every session of the Learner. */
  setDeactivated(id: LearnerId, deactivated: boolean, tx?: DbOrTx): Promise<void>;
  preferences(id: LearnerId, tx?: DbOrTx): Promise<Preferences>;
  /** Applies a partial change and returns the result. Rejects an invalid change and changes nothing. */
  changePreferences(id: LearnerId, change: unknown, tx?: DbOrTx): Promise<Preferences>;
}

export class LearnerNotFound extends Error {
  constructor(id: LearnerId) {
    super(`no Learner ${id}`);
    this.name = "LearnerNotFound";
  }
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const toLearner = (row: typeof t.learners.$inferSelect): Learner => ({
  id: LearnerId.parse(row.id),
  email: row.email,
  role: row.role,
  deactivated: row.deactivated,
  createdAt: row.createdAt,
});

const toPreferences = ({ learnerId: _, updatedAt: __, ...prefs }: typeof t.preferences.$inferSelect): Preferences =>
  prefs;

export const createLearners = (db: Db, log: AuthLog = consoleAuthLog): Learners => {
  const get = async (id: LearnerId, tx: DbOrTx = db) => {
    const [row] = await tx.select().from(t.learners).where(eq(t.learners.id, id));
    return row ? toLearner(row) : null;
  };
  const mustExist = async (id: LearnerId, tx: DbOrTx) => {
    if (!(await get(id, tx))) throw new LearnerNotFound(id);
  };
  const update = async (id: LearnerId, set: Partial<typeof t.learners.$inferInsert>, tx: DbOrTx) => {
    const changed = await tx.update(t.learners).set({ ...set, updatedAt: new Date() }).where(eq(t.learners.id, id)).returning();
    if (!changed.length) throw new LearnerNotFound(id);
  };
  const preferences = async (id: LearnerId, tx: DbOrTx = db) => {
    const [row] = await tx.select().from(t.preferences).where(eq(t.preferences.learnerId, id));
    if (row) return toPreferences(row);
    await mustExist(id, tx);
    return DEFAULT_PREFERENCES;
  };

  return {
    get,
    async findByEmail(email, tx = db) {
      const [row] = await tx.select().from(t.learners).where(eq(t.learners.email, normalizeEmail(email)));
      return row ? toLearner(row) : null;
    },
    async setRole(id, role, tx = db) {
      await update(id, { role }, tx);
      log({ type: "role-changed", learnerId: id, role });
    },
    async setDeactivated(id, deactivated, tx = db) {
      await update(id, { deactivated }, tx);
      if (deactivated) await tx.delete(t.sessions).where(eq(t.sessions.learnerId, id));
      log({ type: deactivated ? "deactivated" : "reactivated", learnerId: id });
    },
    preferences,
    async changePreferences(id, change, tx = db) {
      const next = changePreferences(await preferences(id, tx), change);
      const row = { ...next, updatedAt: new Date() };
      await tx
        .insert(t.preferences)
        .values({ learnerId: id, ...row })
        .onConflictDoUpdate({ target: t.preferences.learnerId, set: row });
      return next;
    },
  };
};

export type NewLearner = {
  email: string;
  role?: Role;
  /** Defaults to false: a new account must verify its email before it can log in. */
  emailVerified?: boolean;
  /** An argon2id hash from `hashPassword`. Without it the account has no password login. */
  passwordHash?: string;
};

/** Creates an account directly, outside Better Auth: for the seed and for tests. */
export const addLearner = async (tx: DbOrTx, learner: NewLearner): Promise<Learner> => {
  const [row] = await tx
    .insert(t.learners)
    .values({
      id: randomUUID(),
      email: normalizeEmail(learner.email),
      // Left undefined, these take the column defaults: a plain, unverified Learner.
      role: learner.role,
      emailVerified: learner.emailVerified,
    })
    .returning();
  const added = toLearner(row!);
  if (learner.passwordHash) {
    await tx.insert(t.loginMethods).values({
      id: randomUUID(),
      learnerId: added.id,
      accountId: added.id,
      providerId: "credential",
      password: learner.passwordHash,
    });
  }
  return added;
};
