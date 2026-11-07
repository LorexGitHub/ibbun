/** Midnight UTC of the newest first Monday that is not after `now`. */
export const latestFirstMonday = (now: Date): Date => {
  for (let back = 0; ; back++) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1 + ((8 - month.getUTCDay()) % 7)));
    if (first <= now) return first;
  }
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
