import type { LevelMastery } from "../contract.ts";

/** From this share Known, a level counts as settled and the Learner's focus moves on. */
export const SETTLED_PERCENT = 90;

export type Stage = "done" | "now" | "next" | "far" | "farther";

export type LevelRow = LevelMastery & { percent: number; stage: Stage };

export const percentKnown = ({ known, total }: LevelMastery): number => (total === 0 ? 0 : Math.floor((known / total) * 100));

const STAGES_AFTER_NOW: Stage[] = ["next", "far", "farther"];

/** The "Your way up" row for each level: settled levels are done, the first unsettled one is now, the rest step away from it. */
export const pathRows = (levels: LevelMastery[]): LevelRow[] => {
  const firstUnsettled = levels.findIndex((l) => percentKnown(l) < SETTLED_PERCENT);
  return levels.map((level, i) => {
    const stage: Stage =
      firstUnsettled < 0 || i < firstUnsettled ? "done" : i === firstUnsettled ? "now" : (STAGES_AFTER_NOW[Math.min(i - firstUnsettled - 1, 2)] ?? "farther");
    return { ...level, percent: percentKnown(level), stage };
  });
};

/** The small print under a level's name. */
export const levelNote = ({ stage, percent, known, total }: LevelRow): string => {
  if (stage === "done" || stage === "now") return `${percent}% · ${total} items`;
  return known === 0 ? "not started" : `${percent}%`;
};
