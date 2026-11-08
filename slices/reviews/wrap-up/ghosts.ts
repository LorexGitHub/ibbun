import type { Review } from "@mojibun/progress";
import type { StudyItemId } from "@mojibun/shared";

/** A Ghost comes after the session that missed it, not inside it. */
export const GHOST_AFTER_MS = 60 * 60_000;
/** A Ghost is short-lived: a miss older than this no longer raises one. */
export const GHOST_UNTIL_MS = 48 * 60 * 60_000;

export type Ghost = { studyItemId: StudyItemId; exampleId: string };

/** The latest `srs` Review of each Study Item, when it was a miss of a known Example and no Ghost has answered it since. */
const unansweredMisses = (log: Review[]): Review[] => {
  const latest = new Map<StudyItemId, { miss: Review | null; ghosted: boolean }>();
  for (const review of log) {
    const state = latest.get(review.studyItemId) ?? { miss: null, ghosted: false };
    if (review.kind === "srs") Object.assign(state, { miss: review.passed || !review.exampleId ? null : review, ghosted: false });
    if (review.kind === "ghost") state.ghosted = true;
    latest.set(review.studyItemId, state);
  }
  return [...latest.values()].flatMap(({ miss, ghosted }) => (miss && !ghosted ? [miss] : []));
};

/** The exact Examples a Learner missed in `srs` Reviews between an hour and two days ago and has not yet met as a Ghost. */
export const ghostsOf = (log: Review[], now: Date): Ghost[] =>
  unansweredMisses(log)
    .filter((miss) => {
      const age = now.getTime() - Date.parse(miss.at);
      return age >= GHOST_AFTER_MS && age <= GHOST_UNTIL_MS;
    })
    .map((miss) => ({ studyItemId: miss.studyItemId, exampleId: miss.exampleId! }));
