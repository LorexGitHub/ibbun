import { describe } from "vitest";
import type { AuthEvent } from "./events.ts";
import { createFakeLearners } from "./fake.ts";
import { addLearner, createLearners } from "./learners.ts";
import { learnersContract } from "./learners.contract.ts";
import { useLearnerDb } from "./db.testing.ts";

describe("Learners, real", () => {
  const pg = useLearnerDb();

  learnersContract(async () => {
    const events: AuthEvent[] = [];
    const log = (e: AuthEvent) => void events.push(e);
    return { learners: createLearners(pg.db, log), add: (l) => addLearner(pg.db, l), events };
  });
});

describe("Learners, fake", () => {
  learnersContract(async () => {
    const events: AuthEvent[] = [];
    const learners = createFakeLearners((e) => void events.push(e));
    return { learners, add: learners.add, events };
  });
});
