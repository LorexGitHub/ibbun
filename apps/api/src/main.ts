import { serve } from "@hono/node-server";
import { createDb } from "@mojibun/db";
import { createLearnerAuth, learnerConfigFromEnv } from "@mojibun/learner";
import { createSmtpMail } from "@mojibun/mail";
import { createApp } from "./app.ts";
import { slices } from "./slices.generated.ts";

const env = process.env;
const { authHandler } = createLearnerAuth({
  db: createDb(env.DATABASE_URL!),
  mail: createSmtpMail({ url: env.SMTP_URL ?? "smtp://localhost:1025", from: "mojibun <noreply@mojibun.test>" }),
  config: learnerConfigFromEnv(env),
});

const port = Number(env.API_PORT ?? 3000);
serve({ fetch: (await createApp(slices, { authHandler })).fetch, port }, () => console.log(`api listening on :${port}`));
