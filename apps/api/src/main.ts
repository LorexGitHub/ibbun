import { serve } from "@hono/node-server";
import { createDb } from "@ibbun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@ibbun/learner";
import { createMail, mailConfigFromEnv } from "@ibbun/mail";
import { createApp } from "./app.ts";
import { slices } from "./slices.generated.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// Local runs need no auth setup; production must set AUTH_SECRET and APP_URL.
const devAuth = { AUTH_SECRET: "dev-only-secret-not-for-production-use", APP_URL: "http://localhost:5173" };
const env = process.env.NODE_ENV === "production" ? process.env : { ...devAuth, ...process.env };

const db = createDb(url);
const mail = createMail(mailConfigFromEnv(process.env));
const { sessions, authHandler } = createLearnerAuth({ db, mail, config: learnerConfigFromEnv(env) });

const port = Number(process.env.API_PORT ?? 3000);
serve({ fetch: (await createApp(slices, { db, sessions }, { authHandler })).fetch, port }, () => console.log(`api listening on :${port}`));
