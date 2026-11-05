import { boolean, index, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

// The Drizzle view of db/migrations. The migrations are the source of truth.
const learner = pgSchema("learner");
const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => at("created_at").notNull().defaultNow();
const updatedAt = () => at("updated_at").notNull().defaultNow();

export const learners = learner.table("learners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["learner", "supervisor"] }).notNull().default("learner"),
  deactivated: boolean("deactivated").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const loginMethods = learner.table("login_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: at("access_token_expires_at"),
  refreshTokenExpiresAt: at("refresh_token_expires_at"),
  scope: text("scope"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = learner.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: at("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_learner").on(t.learnerId)],
);

export const verifications = learner.table("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: at("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rateLimits = learner.table("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: at("window_start").notNull(),
  count: integer("count").notNull(),
});

export const preferences = learner.table("preferences", {
  learnerId: uuid("learner_id")
    .primaryKey()
    .references(() => learners.id, { onDelete: "cascade" }),
  furigana: text("furigana", { enum: ["on", "off", "mixed"] }).notNull(),
  convertRomaji: boolean("convert_romaji").notNull(),
  explanations: text("explanations", { enum: ["english", "japanese", "both"] }).notNull(),
  examMode: boolean("exam_mode").notNull(),
  slowAudio: boolean("slow_audio").notNull(),
  batchSize: integer("batch_size").notNull(),
  dailyBudget: integer("daily_budget").notNull(),
  updatedAt: updatedAt(),
});
