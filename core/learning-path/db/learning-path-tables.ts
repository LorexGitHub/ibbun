import { pgSchema, text, uuid } from "drizzle-orm/pg-core";

// The Drizzle view of db/migrations. The migrations are the source of truth.
const learningPath = pgSchema("learning_path");

export const learnerPath = learningPath.table("learner_path", {
  learnerId: uuid("learner_id").primaryKey(),
  seed: text("seed").notNull(),
  activeTracks: text("active_tracks").array().notNull(),
});
