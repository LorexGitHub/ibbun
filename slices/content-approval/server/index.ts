import { createAuthoring } from "@mojibun/content-graph/authoring";
import { ContentReview } from "@mojibun/content-graph/jobs";
import { createDb } from "@mojibun/db";
import { createPgBossJobs, handler, type Jobs } from "@mojibun/jobs";
import { createLearnerAuth, learnerConfigFromEnv } from "@mojibun/learner";
import { createAnthropicLlm, loadLlmConfig } from "@mojibun/llm";
import { createSmtpMail } from "@mojibun/mail";
import { createSudachiNlp } from "@mojibun/nlp";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { once, required as requiredSetting } from "../src/lazy.ts";
import { createQueueApi } from "../src/queue-api.ts";
import { reviewRun } from "../src/review-job.ts";

const env = process.env;

const required = (name: string) => requiredSetting(env, name);

const db = createDb(required("DATABASE_URL"));
const authoring = createAuthoring(db);

const queue = once(() => createPgBossJobs(required("DATABASE_URL")));
const queueJobs: Jobs = {
  enqueue: async (contract, payload) => (await queue()).enqueue(contract, payload),
  work: async (handlers) => (await queue()).work(handlers),
  stop: async () => (await queue()).stop(),
};

const reviewDeps = once(() => ({
  authoring,
  jobs: queueJobs,
  nlp: createSudachiNlp({ url: required("SUDACHI_URL") }),
  llm: createAnthropicLlm({ config: loadLlmConfig(env) }),
  config: DEFAULT_CONFIG,
}));

const sessions = once(
  () =>
    createLearnerAuth({
      db,
      mail: createSmtpMail({ url: env.SMTP_URL ?? "smtp://localhost:1025", from: "mojibun <noreply@mojibun.test>" }),
      config: learnerConfigFromEnv(env),
    }).sessions,
);

export const api = createQueueApi({ authoring, sessions: { resolve: (headers) => sessions().resolve(headers) } });

export const jobs = [handler(ContentReview, (payload) => reviewRun(reviewDeps(), payload))];
