import { Hono } from "hono";
import { createAuthoring } from "@ibbun/content-graph/authoring";
import { ContentReview } from "@ibbun/content-graph/jobs";
import { createDb } from "@ibbun/db";
import { createPgBossJobs, handler, type Jobs } from "@ibbun/jobs";
import { createLearnerAuth, learnerConfigFromEnv } from "@ibbun/learner";
import { createAnthropicLlm, loadLlmConfig } from "@ibbun/llm";
import { createMail, mailConfigFromEnv } from "@ibbun/mail";
import { createSudachiNlp } from "@ibbun/nlp";
import { createProgress } from "@ibbun/progress";
import { createSamplingApi } from "../sampling/api.ts";
import { DEFAULT_SAMPLING } from "../sampling/config.ts";
import { createPostgresStore } from "../sampling/postgres.ts";
import { createSampling } from "../sampling/sampler.ts";
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
  schedule: async (contract, cron, payload) => (await queue()).schedule(contract, cron, payload),
  stop: async () => (await queue()).stop(),
};

const sampling = createSampling({ store: createPostgresStore(db), authoring, progress: createProgress(db), jobs: queueJobs, config: DEFAULT_SAMPLING });

const reviewDeps = once(() => ({
  authoring,
  jobs: queueJobs,
  nlp: createSudachiNlp({ url: required("SUDACHI_URL") }),
  llm: createAnthropicLlm({ config: loadLlmConfig(env) }),
  config: DEFAULT_CONFIG,
  sampling,
}));

const sessions = once(
  () =>
    createLearnerAuth({
      db,
      mail: createMail(mailConfigFromEnv(env)),
      config: learnerConfigFromEnv(env),
    }).sessions,
);

const resolver = { resolve: (headers: Headers) => sessions().resolve(headers) };

export const api = new Hono()
  .route("/", createQueueApi({ authoring, sessions: resolver }))
  .route("/sampling", createSamplingApi({ authoring, sampling, sessions: resolver }));

export const jobs = [handler(ContentReview, (payload) => reviewRun(reviewDeps(), payload))];
