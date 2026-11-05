import { afterAll, beforeAll, describe } from "vitest";
import { createDb, migrate, type Db } from "@mojibun/db";
import { startTestPostgres, type TestPostgres } from "@mojibun/db/testing";
import type { AuthEvent } from "./events.ts";
import { createFakeLearners } from "./fake.ts";
import { addLearner, createLearners } from "./learners.ts";
import { learnersContract } from "./learners.contract.ts";
import { learnerMigrations } from "./migrations.testing.ts";

describe("Learners, real", () => {
  let pg: TestPostgres;
  let db: Db;
  beforeAll(async () => {
    pg = await startTestPostgres();
    db = createDb(pg.url, { max: 1 });
    await migrate(db.$client, await learnerMigrations());
  });
  afterAll(async () => {
    await db.$client.end();
    await pg.stop();
  });

  learnersContract(async () => {
    const events: AuthEvent[] = [];
    const log = (e: AuthEvent) => void events.push(e);
    return { learners: createLearners(db, log), add: (l) => addLearner(db, l), events };
  });
});

describe("Learners, fake", () => {
  learnersContract(async () => {
    const events: AuthEvent[] = [];
    const learners = createFakeLearners((e) => void events.push(e));
    return { learners, add: learners.add, events };
  });
});
