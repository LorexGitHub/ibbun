import type { ItemProgress } from "@mojibun/progress";

/** When the soonest Review that is not due yet falls due, or null when nothing is scheduled later. */
export const nextDueOf = (items: ItemProgress[], at: Date): string | null => {
  const later = items.flatMap((p) => (p.due && p.due > at ? [p.due.getTime()] : []));
  return later.length ? new Date(Math.min(...later)).toISOString() : null;
};
