import type { Authoring } from "@mojibun/content-graph/authoring";
import { currentLevel } from "@mojibun/content-graph/levels";
import type { JlptLevel } from "@mojibun/shared";
import type { ItemProgress, Mastery } from "@mojibun/progress";

/** Each Study Item's current level; Unlevelled items are null, and so are ones with no candidate at all. */
export const levelsByItem = async (auth: Authoring): Promise<ReadonlyMap<string, JlptLevel | null>> => {
  const candidates = await auth.rows("levelCandidate");
  const grouped = new Map<string, typeof candidates>();
  for (const c of candidates) grouped.set(c.studyItemId, [...(grouped.get(c.studyItemId) ?? []), c]);
  return new Map([...grouped].map(([id, own]) => [id, currentLevel(own)]));
};

/** Weakest first (batch-text.md#earlier-items). */
const WEAKNESS: Record<Mastery, number> = { relearning: 0, learning: 1, young: 2, mature: 3, new: 4 };

const inLevel = (levels: ReadonlyMap<string, JlptLevel | null>, level: JlptLevel | "unlevelled") => (id: string) =>
  (levels.get(id) ?? null) === (level === "unlevelled" ? null : level);

const dueAt = (p: ItemProgress) => p.due?.getTime() ?? 0;

/**
 * The Study Items of the batch's level the Learner met in earlier batches, weakest first. `progress` does not
 * expose stability, so within a state the soonest due stands in for the lowest stability.
 */
export const earlierItems = (
  met: readonly ItemProgress[],
  levels: ReadonlyMap<string, JlptLevel | null>,
  level: JlptLevel | "unlevelled",
  batch: readonly string[],
  count: number,
): string[] =>
  met
    .filter((p) => !batch.includes(p.studyItemId) && inLevel(levels, level)(p.studyItemId))
    .sort((a, b) => WEAKNESS[a.mastery] - WEAKNESS[b.mastery] || dueAt(a) - dueAt(b))
    .slice(0, count)
    .map((p) => p.studyItemId);

/**
 * How far the Learner is through the batch's level: the share of its Study Items met, from 0 to 1.
 * For Unlevelled, the number of Unlevelled items met.
 */
export const levelProgress = (
  met: readonly ItemProgress[],
  levels: ReadonlyMap<string, JlptLevel | null>,
  level: JlptLevel | "unlevelled",
): number => {
  const here = inLevel(levels, level);
  const metHere = met.filter((p) => here(p.studyItemId)).length;
  if (level === "unlevelled") return metHere;
  const total = [...levels.keys()].filter(here).length;
  return total ? metHere / total : 0;
};
