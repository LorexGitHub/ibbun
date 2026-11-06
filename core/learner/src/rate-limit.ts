import { sql } from "drizzle-orm";
import type { DbOrTx } from "@mojibun/db";

export type RateLimitRule = { windowSeconds: number; max: number };

/**
 * Counts one hit on `key` in a fixed window, in one atomic statement.
 * Returns null when the hit is allowed, or how many seconds to wait.
 */
export const hitRateLimit = async (
  db: DbOrTx,
  key: string,
  { windowSeconds, max }: RateLimitRule,
  now: Date,
): Promise<{ retryAfter: number } | null> => {
  const windowStartedBefore = new Date(now.getTime() - windowSeconds * 1000);
  const { rows } = await db.execute<{ count: number; window_start: Date | string }>(sql`
    INSERT INTO learner.rate_limits (key, window_start, count) VALUES (${key}, ${now}, 1)
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE WHEN rate_limits.window_start <= ${windowStartedBefore} THEN ${now} ELSE rate_limits.window_start END,
      count = CASE WHEN rate_limits.window_start <= ${windowStartedBefore} THEN 1 ELSE rate_limits.count + 1 END
    RETURNING count, window_start`);
  const { count, window_start } = rows[0]!;
  if (count <= max) return null;
  const endsAt = new Date(window_start).getTime() + windowSeconds * 1000;
  return { retryAfter: Math.ceil((endsAt - now.getTime()) / 1000) };
};
