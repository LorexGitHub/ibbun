import type { BrowsableType, ContentGraph, StudyItemSummary } from "@mojibun/content-graph";
import type { Progress } from "@mojibun/progress";
import { JLPT_LEVELS, type LearnerId, type StudyItemId } from "@mojibun/shared";
import type { Due, Today } from "../contract.ts";

/** The size of one Learn batch, which is a Learner's own preference. */
export type BatchSize = (learnerId: LearnerId) => Promise<number>;

export type TodayDeps = { progress: Progress; contentGraph: ContentGraph; batchSize: BatchSize; learnerId: LearnerId; now: Date };

const TYPES: BrowsableType[] = ["kanji", "word", "grammar_point"];
const DAY_MS = 86_400_000;
const dayOf = (at: Date | string) => Math.floor(new Date(at).getTime() / DAY_MS);

/** Every visible Study Item of every level, as `levelList` returns them. */
const levelLists = async (contentGraph: ContentGraph) =>
  Promise.all(
    JLPT_LEVELS.map(async (level) => ({
      level,
      items: (await Promise.all(TYPES.map((type) => contentGraph.levelList(level, type)))).flat(),
    })),
  );

/** Days in a row with a Review, counted back from today, or from yesterday while today is still open. Lookups are not practice. */
const streakDays = (reviewDays: Set<number>, today: number): number => {
  let day = reviewDays.has(today) ? today : today - 1;
  let streak = 0;
  for (; reviewDays.has(day); day--) streak++;
  return streak;
};

const countByType = async (contentGraph: ContentGraph, known: Map<StudyItemId, StudyItemSummary>, ids: StudyItemId[]): Promise<Due> => {
  const due: Due = { total: 0, kanji: 0, word: 0, grammarPoint: 0 };
  for (const id of ids) {
    const type = known.get(id)?.type ?? (await contentGraph.studyItem(id))?.item.type;
    if (type === "kanji" || type === "word") due[type]++;
    else if (type === "grammar_point") due.grammarPoint++;
    else continue;
    due.total++;
  }
  return due;
};

/** What the Today screen shows one Learner at `now`. */
export const buildToday = async ({ progress, contentGraph, batchSize, learnerId, now }: TodayDeps): Promise<Today> => {
  const [lists, knownIds, dueIds, log, batch] = await Promise.all([
    levelLists(contentGraph),
    progress.known(learnerId),
    progress.due(learnerId, now),
    progress.log(learnerId),
    batchSize(learnerId),
  ]);
  const known = new Set(knownIds);
  const byId = new Map(lists.flatMap((l) => l.items).map((item) => [item.id, item]));
  const practised = new Set(log.filter((r) => r.kind !== "lookup").map((r) => dayOf(r.at)));
  return {
    due: await countByType(contentGraph, byId, dueIds),
    streakDays: streakDays(practised, dayOf(now)),
    levels: lists.map(({ level, items }) => ({ level, total: items.length, known: items.filter((i) => known.has(i.id)).length })),
    batchSize: batch,
  };
};
