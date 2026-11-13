import type { StudyItemId } from "@ibbun/shared";
import type { Review } from "./review.ts";
import { Scheduler } from "./scheduler.ts";

/** Anki's states (ADR 0001). There is no Mastered state. */
export type Mastery = "new" | "learning" | "young" | "mature" | "relearning";

/** Stability, in days, from which a Known Study Item is Mature. */
export const MATURE_STABILITY_DAYS = 21;

/** One Learner's progress on one Study Item, folded from the log. */
export type ItemProgress = {
  studyItemId: StudyItemId;
  mastery: Mastery;
  /** Passed a scheduled Review once, or claimed. Once Known, always Known. */
  known: boolean;
  /** Passed Learn, made Known by Placement, or skipped with "I know this". */
  introduced: boolean;
  /** When the next scheduled Review is due; null while New. */
  due: Date | null;
};

const introduces = (r: Review) => Scheduler.feeds(r) || (r.kind === "learn" && r.passed);
const makesKnown = (r: Review) => r.kind === "manual" || (r.kind === "srs" && r.passed);

export const masteryOf = (known: boolean, stability: number, relearning: boolean): Mastery => {
  if (!known) return "learning";
  if (relearning) return "relearning";
  return stability >= MATURE_STABILITY_DAYS ? "mature" : "young";
};

/** Folds one Learner × Study Item's Reviews, oldest first, into its progress. */
export const project = (studyItemId: StudyItemId, reviews: Review[]): ItemProgress => {
  const first = reviews.find(introduces);
  if (!first) return { studyItemId, mastery: "new", known: false, introduced: false, due: null };
  const known = reviews.some(makesKnown);
  const schedule = Scheduler.fold(reviews.filter(Scheduler.feeds), new Date(first.at));
  return {
    studyItemId,
    mastery: masteryOf(known, schedule.stability, schedule.relearning),
    known,
    introduced: true,
    due: schedule.due,
  };
};
