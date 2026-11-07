import { z } from "zod";
import { DEFAULT_BANDS, STRATEGIES, type Bands, type StrategyName } from "./strategy.ts";

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const Env = z.object({
  /** The one value that picks the live strategy version. */
  LEARNING_PATH_STRATEGY: z.enum(Object.keys(STRATEGIES) as [StrategyName, ...StrategyName[]]).default("frequency-v1"),
  LEARNING_PATH_KANJI_FREQUENCY_BAND: positiveInt(DEFAULT_BANDS.kanjiFrequency),
  LEARNING_PATH_WORD_NF_TAGS_PER_BAND: positiveInt(DEFAULT_BANDS.wordNfTags),
});

export type LearningPathConfig = { strategy: StrategyName; bands: Bands };

export const DEFAULT_CONFIG: LearningPathConfig = { strategy: "frequency-v1", bands: DEFAULT_BANDS };

/** Reads the config from the environment. Throws, naming every problem, when a value is invalid. */
export const learningPathConfigFromEnv = (env: Record<string, string | undefined>): LearningPathConfig => {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const e = parsed.data;
  return {
    strategy: e.LEARNING_PATH_STRATEGY,
    bands: { kanjiFrequency: e.LEARNING_PATH_KANJI_FREQUENCY_BAND, wordNfTags: e.LEARNING_PATH_WORD_NF_TAGS_PER_BAND },
  };
};
