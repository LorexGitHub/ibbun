import { createDb } from "@mojibun/db";
import { createAuthoring } from "@mojibun/content-graph/authoring";
import { createPgBossJobs } from "@mojibun/jobs";
import { createAnthropicLlm, loadLlmConfig } from "@mojibun/llm";
import { loadGenerationConfig } from "./config.ts";
import { contentGeneration } from "./generate.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const generation = contentGeneration({
  auth: createAuthoring(createDb(url)),
  llm: createAnthropicLlm({ config: loadLlmConfig(process.env) }),
  jobs: await createPgBossJobs(url),
  config: loadGenerationConfig(process.env),
});

export const jobs = generation.handlers;
