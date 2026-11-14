import { describe, expect, it } from "vitest";
import { eventBridgeCron } from "./cron.ts";

describe("eventBridgeCron", () => {
  it("adds the year and puts ? in the day-of-week field when every day runs", () => {
    expect(eventBridgeCron("0 12 * * *")).toBe("cron(0 12 * * ? *)");
  });

  it("names the days, so Unix 1 stays Monday", () => {
    expect(eventBridgeCron("0 12 * * 1")).toBe("cron(0 12 ? * MON *)");
  });

  it("names every day in a list, and Unix 0 is Sunday", () => {
    expect(eventBridgeCron("0 12 * * 6,0")).toBe("cron(0 12 ? * SAT,SUN *)");
  });

  it("reads Unix 7 as Sunday and keeps ranges", () => {
    expect(eventBridgeCron("0 12 * * 1-5,7")).toBe("cron(0 12 ? * MON-FRI,SUN *)");
  });

  it("keeps day names as they are, and plain fields", () => {
    expect(eventBridgeCron("*/15 6-18 * * MON,WED")).toBe("cron(*/15 6-18 ? * MON,WED *)");
  });

  it("keeps a day of the month and puts ? in the day-of-week field", () => {
    expect(eventBridgeCron("30 3 1 * *")).toBe("cron(30 3 1 * ? *)");
  });

  it("refuses what Scheduler cannot take", () => {
    expect(() => eventBridgeCron("0 12 1 * 1")).toThrow(/both/);
    expect(() => eventBridgeCron("0 12 * *")).toThrow(/five-field/);
    expect(() => eventBridgeCron("0 12 * * * *")).toThrow(/five-field/);
  });
});
