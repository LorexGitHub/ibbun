import { BatchTextGenerate, ContentGenerate, ListeningSynthesise, PracticeGenerate } from "@ibbun/content-graph/jobs";
import { createAuthoring } from "@ibbun/content-graph/authoring";
import { createDb } from "@ibbun/db";
import { createSqsJobsFromEnv, handler } from "@ibbun/jobs";
import { createAnthropicLlm, loadLlmConfig } from "@ibbun/llm";
import { createProgress, createTexts } from "@ibbun/progress";
import { createVoicevoxTts } from "@ibbun/tts";
import { audioStoreAt } from "../kinds/synthesise/audio-store.ts";
import { loadSynthesisConfig, synthesise, type SynthesiseDeps } from "../kinds/synthesise/index.ts";
import { loadGenerationConfig } from "./config.ts";
import { contentGeneration, type ContentGeneration } from "./generate.ts";

// apps/api loads this module too, so nothing connects until the worker runs a job.
let generation: Promise<ContentGeneration> | undefined;
const connect = async (): Promise<ContentGeneration> => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url);
  return contentGeneration({
    auth: createAuthoring(db),
    llm: createAnthropicLlm({ config: loadLlmConfig(process.env) }),
    jobs: createSqsJobsFromEnv(process.env),
    progress: createProgress(db),
    texts: createTexts(db),
    config: loadGenerationConfig(process.env),
  });
};

const connected = () =>
  (generation ??= connect().catch((error) => {
    generation = undefined;
    throw error;
  }));

// Same lazy connection for the TTS handler: it needs VOICEVOX_URL, AUDIO_DIR and VOICE_ALLOW_LIST only when a job runs.
let synthesis: SynthesiseDeps | undefined;
const synthesisDeps = (): SynthesiseDeps => {
  const config = loadSynthesisConfig(process.env);
  return (synthesis ??= {
    auth: createAuthoring(createDb(config.databaseUrl)),
    tts: createVoicevoxTts({ url: config.voicevoxUrl }),
    store: audioStoreAt(config.audioDir),
    voices: config.voices,
  });
};

export const jobs = [
  handler(ContentGenerate, async (payload) => (await connected()).generate(payload)),
  handler(BatchTextGenerate, async (payload) => (await connected()).requestBatchText(payload)),
  handler(PracticeGenerate, async (payload) => (await connected()).requestPracticeText(payload)),
  handler(ListeningSynthesise, ({ target }) => synthesise(synthesisDeps(), target)),
];
