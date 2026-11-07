/** Midnight UTC of the first Monday of a month (`month` 0 to 11; -1 is December of the year before). */
const firstMondayOf = (year: number, month: number): Date => {
  const first = new Date(Date.UTC(year, month, 1));
  return new Date(Date.UTC(year, month, 1 + ((8 - first.getUTCDay()) % 7)));
};

/** Midnight UTC of the newest first Monday that is not after `now`: this month's, or else last month's. */
export const latestFirstMonday = (now: Date): Date => {
  const thisMonth = firstMondayOf(now.getUTCFullYear(), now.getUTCMonth());
  return thisMonth <= now ? thisMonth : firstMondayOf(now.getUTCFullYear(), now.getUTCMonth() - 1);
};

/**
 * Whether the monthly refresh is due: the data went live before the newest first Monday, or there is none. Checked every
 * day, so a run that failed on the first Monday is tried again the next day instead of waiting a month.
 */
export const monthlyRefreshDue = (now: Date, liveSince: Date | null): boolean => liveSince === null || liveSince < latestFirstMonday(now);

/** The alarm fires when a live dataset has not been refreshed for longer than this (licensing.md#monthly-refresh). */
export const STALE_AFTER_DAYS = 31;

const DAY_MS = 24 * 60 * 60 * 1000;

export const ageInDays = (since: Date, now: Date): number => Math.floor((now.getTime() - since.getTime()) / DAY_MS);

export const isStale = (appliedAt: Date, now: Date): boolean => now.getTime() - appliedAt.getTime() > STALE_AFTER_DAYS * DAY_MS;
