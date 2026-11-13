import type { ReadingPassage } from "@ibbun/content-graph";
import type { BatchText } from "@ibbun/progress";
import { JLPT_LEVELS } from "@ibbun/shared";
import type { EpisodeLists, TextLevel } from "../contract.ts";

const LEVEL_ORDER: TextLevel[] = [...JLPT_LEVELS, "unlevelled"];

/**
 * The Learner's Batch Texts as episodes per level, easiest level first. A text whose passage is not approved yet
 * is left out: it reaches the Learner only once approved (batch-text.md#approval).
 */
export const episodeLists = async (
  texts: BatchText[],
  passageOf: (id: string) => Promise<ReadingPassage | null>,
): Promise<EpisodeLists> => {
  const ready = (await Promise.all(texts.map(async (text) => ({ text, passage: await passageOf(text.passageId) })))).flatMap(
    ({ text, passage }) => (passage ? [{ text, title: passage.title }] : []),
  );
  const levels = LEVEL_ORDER.map((level) => ({
    level,
    episodes: ready
      .filter(({ text }) => text.level === level)
      .sort((a, b) => a.text.episode - b.text.episode)
      .map(({ text, title }) => ({ id: text.id, episode: text.episode, title, at: text.at })),
  }));
  return { levels: levels.filter((l) => l.episodes.length > 0) };
};
