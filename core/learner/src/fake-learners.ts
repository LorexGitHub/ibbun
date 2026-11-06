import { randomUUID } from "node:crypto";
import { LearnerId } from "@mojibun/shared";
import type { AuthLog } from "./events.ts";
import { LearnerNotFound, normalizeEmail, type Learner, type Learners, type NewLearner } from "./learners.ts";
import { changePreferences, DEFAULT_PREFERENCES, type Preferences } from "./preferences.ts";

export interface FakeLearners extends Learners {
  /** Creates an account. */
  add(learner: NewLearner): Promise<Learner>;
}

/** An in-memory Learners for slice tests. Transactions are accepted and ignored. */
export const createFakeLearners = (log: AuthLog = () => undefined): FakeLearners => {
  const learners = new Map<LearnerId, Learner>();
  const prefs = new Map<LearnerId, Preferences>();
  const mustGet = (id: LearnerId) => {
    const learner = learners.get(id);
    if (!learner) throw new LearnerNotFound(id);
    return learner;
  };

  return {
    async add({ email, role = "learner" }) {
      const learner: Learner = {
        id: LearnerId.parse(randomUUID()),
        email: normalizeEmail(email),
        role,
        deactivated: false,
        createdAt: new Date(),
      };
      learners.set(learner.id, learner);
      prefs.set(learner.id, DEFAULT_PREFERENCES);
      return { ...learner };
    },
    async get(id) {
      const learner = learners.get(id);
      return learner ? { ...learner } : null;
    },
    async findByEmail(email) {
      const learner = [...learners.values()].find((l) => l.email === normalizeEmail(email));
      return learner ? { ...learner } : null;
    },
    async setRole(id, role) {
      mustGet(id).role = role;
      log({ type: "role-changed", learnerId: id, role });
    },
    async setDeactivated(id, deactivated) {
      mustGet(id).deactivated = deactivated;
      log({ type: deactivated ? "deactivated" : "reactivated", learnerId: id });
    },
    async preferences(id) {
      mustGet(id);
      return prefs.get(id)!;
    },
    async changePreferences(id, change) {
      mustGet(id);
      const next = changePreferences(prefs.get(id)!, change);
      prefs.set(id, next);
      return next;
    },
  };
};
