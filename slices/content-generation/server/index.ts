import { ContentGenerate } from "@mojibun/content-graph/jobs";
import { createAuthoring } from "@mojibun/content-graph/authoring";
import { createDb } from "@mojibun/db";
import { createPgBossJobs, handler } from "@mojibun/jobs";
import { createAnthropicLlm, loadLlmConfig } from "@mojibun/llm";
import { loadGenerationConfig } from "./config.ts";
import { contentGeneration, type ContentGeneration } from "./generate.ts";

// apps/api loads this module too, so nothing connects until the worker runs a job.
let generation: Promise<ContentGeneration> | undefined;
const connect = async (): Promise<ContentGeneration> => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return contentGeneration({
    auth: createAuthoring(createDb(url)),
    llm: createAnthropicLlm({ config: loadLlmConfig(process.env) }),
    jobs: await createPgBossJobs(url),
    config: loadGenerationConfig(process.env),
  });
};

export const jobs = [
  handler(ContentGenerate, async (payload) => {
    generation ??= connect().catch((error) => {
      generation = undefined;
      throw error;
    });
    await (await generation).generate(payload);
  }),
];
