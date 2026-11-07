import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, learningPathConfigFromEnv } from "./config.ts";

describe("learningPathConfigFromEnv", () => {
  it("defaults to frequency-v1 with the documented band sizes", () => {
    expect(learningPathConfigFromEnv({})).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toEqual({ strategy: "frequency-v1", bands: { kanjiFrequency: 250, wordNfTags: 1 } });
  });

  it("reads the strategy and band sizes", () => {
    const env = { LEARNING_PATH_STRATEGY: "frequency-v1", LEARNING_PATH_KANJI_FREQUENCY_BAND: "100", LEARNING_PATH_WORD_NF_TAGS_PER_BAND: "2" };
    expect(learningPathConfigFromEnv(env)).toEqual({ strategy: "frequency-v1", bands: { kanjiFrequency: 100, wordNfTags: 2 } });
  });

  it("names every invalid value", () => {
    const env = { LEARNING_PATH_STRATEGY: "v9", LEARNING_PATH_KANJI_FREQUENCY_BAND: "0" };
    expect(() => learningPathConfigFromEnv(env)).toThrow(/LEARNING_PATH_STRATEGY: .*; LEARNING_PATH_KANJI_FREQUENCY_BAND: /);
  });
});
