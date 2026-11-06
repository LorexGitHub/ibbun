import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useLearnerDb } from "./db.testing.ts";
import { hitRateLimit } from "./rate-limit.ts";

describe("hitRateLimit", () => {
  const pg = useLearnerDb();

  // PGlite serves one connection, so a bigger pool makes concurrent queries wait; on
  // Postgres the extra connections would miss the time zone.
  it("runs concurrent queries promptly, all in a database clock that is not UTC", async () => {
    const zones = await Promise.all(
      [1, 2, 3].map(() => pg.db.execute<{ TimeZone: string }>(sql`SHOW TIME ZONE`).then((r) => r.rows[0]!.TimeZone)),
    );
    expect(zones).toEqual(["Asia/Tokyo", "Asia/Tokyo", "Asia/Tokyo"]);
  }, 5_000);

  const rule = { windowSeconds: 60, max: 3 };
  const at = (seconds: number) => new Date(Date.UTC(2026, 10, 5, 12, 0, seconds));

  it("allows up to max hits in a window, then blocks with the seconds left", async () => {
    const results = [];
    for (const s of [0, 10, 20, 30]) results.push(await hitRateLimit(pg.db, "a", rule, at(s)));
    expect(results).toEqual([null, null, null, { retryAfter: 30 }]);
  });

  it("starts a new window once the old one has passed", async () => {
    for (const s of [0, 1, 2, 3]) await hitRateLimit(pg.db, "b", rule, at(s));
    expect(await hitRateLimit(pg.db, "b", rule, at(60))).toBeNull();
    expect(await hitRateLimit(pg.db, "b", rule, at(61))).toBeNull();
  });

  it("counts each key on its own", async () => {
    for (const s of [0, 1, 2]) await hitRateLimit(pg.db, "c", rule, at(s));
    expect(await hitRateLimit(pg.db, "c", rule, at(3))).toEqual({ retryAfter: 57 });
    expect(await hitRateLimit(pg.db, "d", rule, at(3))).toBeNull();
  });

  it("rounds the wait up to a whole second and never answers 0", async () => {
    const tight = { windowSeconds: 1, max: 1 };
    await hitRateLimit(pg.db, "e", tight, new Date(at(0).getTime()));
    expect(await hitRateLimit(pg.db, "e", tight, new Date(at(0).getTime() + 999))).toEqual({ retryAfter: 1 });
  });
});
