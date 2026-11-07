import { describe, expect, it } from "vitest";
import { ageInDays, isStale, latestFirstMonday, monthlyRefreshDue } from "./schedule.ts";

describe("staleness", () => {
  const applied = new Date("2026-10-01T00:00:00Z");

  it("is stale only after more than 31 days", () => {
    expect(isStale(applied, new Date("2026-11-01T00:00:00Z"))).toBe(false);
    expect(isStale(applied, new Date("2026-11-01T00:00:01Z"))).toBe(true);
  });

  it("counts whole days", () => {
    expect(ageInDays(applied, new Date("2026-11-04T10:00:00Z"))).toBe(34);
  });
});

describe("latestFirstMonday", () => {
  it("is this month's first Monday once it has come", () => {
    expect(latestFirstMonday(new Date("2026-11-02T00:00:00Z"))).toEqual(new Date("2026-11-02T00:00:00Z"));
    expect(latestFirstMonday(new Date("2026-11-20T09:00:00Z"))).toEqual(new Date("2026-11-02T00:00:00Z"));
  });

  it("is last month's first Monday before this month's has come", () => {
    expect(latestFirstMonday(new Date("2026-11-01T23:59:59Z"))).toEqual(new Date("2026-10-05T00:00:00Z"));
  });

  it("handles a month that starts on a Monday, and a year boundary", () => {
    expect(latestFirstMonday(new Date("2026-06-01T10:00:00Z"))).toEqual(new Date("2026-06-01T00:00:00Z"));
    expect(latestFirstMonday(new Date("2027-01-02T10:00:00Z"))).toEqual(new Date("2026-12-07T00:00:00Z"));
  });
});

describe("monthlyRefreshDue", () => {
  const monday = new Date("2026-11-02T12:00:00Z");

  it("is due on the first Monday when the live data is from before it", () => {
    expect(monthlyRefreshDue(monday, new Date("2026-10-06T12:00:00Z"))).toBe(true);
  });

  it("is not due once this month's run went live", () => {
    expect(monthlyRefreshDue(new Date("2026-11-03T12:00:00Z"), new Date("2026-11-02T12:05:00Z"))).toBe(false);
  });

  it("is due again the day after a first Monday run failed, and is due when nothing was ever imported", () => {
    expect(monthlyRefreshDue(new Date("2026-11-03T12:00:00Z"), new Date("2026-10-06T12:00:00Z"))).toBe(true);
    expect(monthlyRefreshDue(monday, null)).toBe(true);
  });

  it("is not due in the middle of a month that already has its run", () => {
    expect(monthlyRefreshDue(new Date("2026-11-19T12:00:00Z"), new Date("2026-11-02T12:05:00Z"))).toBe(false);
  });
});
