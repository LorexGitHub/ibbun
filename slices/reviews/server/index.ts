import { Hono } from "hono";
import { createDb } from "@mojibun/db";
import { createContentGraph } from "@mojibun/content-graph";
import { createLearnerAuth, learnerConfigFromEnv } from "@mojibun/learner";
import { createSmtpMail } from "@mojibun/mail";
import { createProgress } from "@mojibun/progress";
import { createReviewsApi } from "./api.ts";

const env = process.env;
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const db = createDb(env.DATABASE_URL);
const mail = createSmtpMail({ url: env.SMTP_URL ?? "smtp://localhost:1025", from: "mojibun <noreply@mojibun.test>" });
const { sessions, learners } = createLearnerAuth({ db, mail, config: learnerConfigFromEnv(env) });

export const api = new Hono().route(
  "/",
  createReviewsApi({ sessions, learners, contentGraph: createContentGraph(db), progress: createProgress(db), now: () => new Date() }),
);
