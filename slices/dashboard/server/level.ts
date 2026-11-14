import type { ContentGraph, StudyItemSummary } from "@ibbun/content-graph";
import type { Progress } from "@ibbun/progress";
import type { JlptLevel, LearnerId, StudyItemId } from "@ibbun/shared";
import type { LevelPage, Mastery } from "../contract.ts";

export type LevelDeps = { progress: Progress; contentGraph: ContentGraph; learnerId: LearnerId; now: Date; level: JlptLevel };

const mastery = (items: StudyItemSummary[], known: Set<StudyItemId>): Mastery => ({
  total: items.length,
  known: items.filter((item) => known.has(item.id)).length,
});

/** What one JLPT Level's page shows one Learner at `now`. */
export const buildLevel = async ({ progress, contentGraph, learnerId, now, level }: LevelDeps): Promise<LevelPage> => {
  const [kanji, word, grammarPoint, clips, knownIds, dueIds] = await Promise.all([
    contentGraph.levelList(level, "kanji"),
    contentGraph.levelList(level, "word"),
    contentGraph.levelList(level, "grammar_point"),
    contentGraph.listeningClips(level),
    progress.known(learnerId),
    progress.due(learnerId, now),
  ]);
  const known = new Set(knownIds);
  const here = new Set([...kanji, ...word, ...grammarPoint].map((item) => item.id));
  return {
    level,
    kanji: mastery(kanji, known),
    word: mastery(word, known),
    grammarPoint: mastery(grammarPoint, known),
    due: dueIds.filter((id) => here.has(id)).length,
    clips: clips.length,
  };
};
