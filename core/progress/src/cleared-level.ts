import type { StudyItemId } from "@ibbun/shared";

/**
 * A JLPT Level is cleared when every levelled Kanji of it is Known (listening.md#cleared-level).
 * The caller reads the level's Kanji from `content-graph`, without Suspended or Retired ones.
 * A level with no Kanji is not cleared.
 */
export const isLevelCleared = (levelKanjiIds: readonly StudyItemId[], knownIds: readonly StudyItemId[]): boolean => {
  const known = new Set(knownIds);
  return levelKanjiIds.length > 0 && levelKanjiIds.every((id) => known.has(id));
};
