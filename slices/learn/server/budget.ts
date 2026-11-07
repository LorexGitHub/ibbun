import type { Review } from "@mojibun/progress";

const DAY_MS = 86_400_000;
const dayOf = (at: Date | string) => Math.floor(new Date(at).getTime() / DAY_MS);

/** A Review that introduced a Study Item through Learn: a passed quiz, or "I know this". */
const introducedInLearn = (r: Review) => (r.kind === "learn" && r.passed) || (r.kind === "manual" && r.source === "learn-skip");

/** How many Study Items Learn introduced on the UTC day of `now`, which is what the daily budget limits. */
export const learnedToday = (log: Review[], now: Date): number =>
  new Set(log.filter((r) => introducedInLearn(r) && dayOf(r.at) === dayOf(now)).map((r) => r.studyItemId)).size;
