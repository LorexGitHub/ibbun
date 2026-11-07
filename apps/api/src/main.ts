import { serve } from "@hono/node-server";
import { createDb } from "@mojibun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@mojibun/learner";
import { createSmtpMail } from "@mojibun/mail";
import type { ServerContext } from "@mojibun/slice";
import { createApp } from "./app.ts";
import { slices } from "./slices.generated.ts";

/** What slices get: the database and, once the Learner auth is configured, the session resolver behind every role check. */
const context = (env: NodeJS.ProcessEnv): ServerContext => {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || !env.AUTH_SECRET) return { databaseUrl };
  const mail = createSmtpMail({ url: env.SMTP_URL ?? "smtp://localhost:1025", from: env.MAIL_FROM ?? "mojibun <noreply@mojibun.test>" });
  const { sessions } = createLearnerAuth({ db: createDb(databaseUrl, { max: 4 }), mail, config: learnerConfigFromEnv(env) });
  return { databaseUrl, sessions };
};

const port = Number(process.env.API_PORT ?? 3000);
serve({ fetch: (await createApp(slices, context(process.env))).fetch, port }, () => console.log(`api listening on :${port}`));
