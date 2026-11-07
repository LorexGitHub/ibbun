import { BatchTextGenerate, ContentGenerate, ListeningSynthesise } from "@mojibun/content-graph/jobs";
import { createAuthoring } from "@mojibun/content-graph/authoring";
import { createDb } from "@mojibun/db";
import { createPgBossJobs, handler } from "@mojibun/jobs";
import { createAnthropicLlm, loadLlmConfig } from "@mojibun/llm";
import { createProgress, createTexts } from "@mojibun/progress";
import { createVoicevoxTts } from "@mojibun/tts";
import { createDirectoryAudioStore, loadVoices, synthesise, type SynthesiseDeps } from "../kinds/synthesise/index.ts";
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
    jobs: await createPgBossJobs(url),
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
  const url = process.env.DATABASE_URL;
  const voicevox = process.env.VOICEVOX_URL;
  const dir = process.env.AUDIO_DIR;
  if (!url || !voicevox || !dir) throw new Error("DATABASE_URL, VOICEVOX_URL and AUDIO_DIR must be set to synthesise");
  return (synthesis ??= {
    auth: createAuthoring(createDb(url)),
    tts: createVoicevoxTts({ url: voicevox }),
    store: createDirectoryAudioStore(dir),
    voices: loadVoices(process.env),
  });
};

export const jobs = [
  handler(ContentGenerate, async (payload) => (await connected()).generate(payload)),
  handler(BatchTextGenerate, async (payload) => (await connected()).requestBatchText(payload)),
  handler(ListeningSynthesise, ({ target }) => synthesise(synthesisDeps(), target)),
];
