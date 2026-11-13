import { describe, expect, it } from "vitest";
import type { ItemProgress } from "@ibbun/progress";
import { StudyItemId } from "@ibbun/shared";
import { nextDueOf } from "./next-due.ts";

const NOW = new Date("2026-11-06T09:00:00.000Z");
const item = (due: string | null): ItemProgress => ({ studyItemId: StudyItemId.parse("00000000-0000-4000-8000-000000000001"), mastery: "learning", known: false, introduced: true, due: due ? new Date(due) : null }) as ItemProgress;

describe("when the next Review falls due", () => {
  it("is the soonest time after now", () => {
    expect(nextDueOf([item("2026-11-08T09:00:00.000Z"), item("2026-11-06T16:40:00.000Z"), item("2026-11-07T09:00:00.000Z")], NOW)).toBe("2026-11-06T16:40:00.000Z");
  });

  it("leaves out what is due already, at this very moment too, and what has no schedule", () => {
    expect(nextDueOf([item("2026-11-01T09:00:00.000Z"), item(NOW.toISOString()), item(null), item("2026-11-09T09:00:00.000Z")], NOW)).toBe("2026-11-09T09:00:00.000Z");
  });

  it("is null when nothing is scheduled later", () => {
    expect(nextDueOf([], NOW)).toBeNull();
    expect(nextDueOf([item("2026-11-01T09:00:00.000Z")], NOW)).toBeNull();
  });
});
