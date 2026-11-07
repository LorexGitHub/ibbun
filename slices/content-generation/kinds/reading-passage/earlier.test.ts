import { describe, expect, it } from "vitest";
import type { ItemProgress, Mastery } from "@mojibun/progress";
import type { JlptLevel } from "@mojibun/shared";
import { StudyItemId } from "@mojibun/shared";
import { randomUUID } from "node:crypto";
import { contextOf, reasonOf } from "./context.ts";
import { earlierItems, levelProgress } from "./earlier.ts";

const progress = (mastery: Mastery, dueDay: number | null = null): ItemProgress => ({
  studyItemId: StudyItemId.parse(randomUUID()),
  mastery,
  known: mastery !== "learning",
  introduced: true,
  due: dueDay === null ? null : new Date(Date.UTC(2026, 10, dueDay)),
});
const levelsOf = (...entries: [ItemProgress, JlptLevel | null][]) => new Map(entries.map(([p, l]) => [p.studyItemId, l]));

describe("earlier items", () => {
  it("come weakest first: Relearning, Learning, Young, Mature, and the soonest due within a state", () => {
    const mature = progress("mature", 20);
    const youngLate = progress("young", 9);
    const youngSoon = progress("young", 3);
    const learning = progress("learning", 5);
    const relearning = progress("relearning", 30);
    const levels = levelsOf(...[mature, youngLate, youngSoon, learning, relearning].map((p): [ItemProgress, JlptLevel] => [p, "N4"]));
    const order = earlierItems([mature, youngLate, youngSoon, learning, relearning], levels, "N4", [], 10);
    expect(order).toEqual([relearning, learning, youngSoon, youngLate, mature].map((p) => p.studyItemId));
  });

  it("are at most the count asked for, of the batch's level, and never the batch itself", () => {
    const here = [progress("young", 1), progress("young", 2), progress("young", 3)];
    const other = progress("learning", 1);
    const unlevelled = progress("learning", 2);
    const levels = levelsOf(...here.map((p): [ItemProgress, JlptLevel] => [p, "N5"]), [other, "N4"], [unlevelled, null]);
    const met = [...here, other, unlevelled];
    expect(earlierItems(met, levels, "N5", [here[0]!.studyItemId], 5)).toEqual([here[1]!, here[2]!].map((p) => p.studyItemId));
    expect(earlierItems(met, levels, "N5", [], 2)).toEqual([here[0]!, here[1]!].map((p) => p.studyItemId));
    expect(earlierItems(met, levels, "unlevelled", [], 5)).toEqual([unlevelled.studyItemId]);
  });
});

describe("level progress", () => {
  it("is the share of the level's Study Items met", () => {
    const a = progress("young");
    const b = progress("young");
    const levels = new Map<string, JlptLevel | null>([[a.studyItemId, "N3"], [b.studyItemId, "N3"], [randomUUID(), "N3"], [randomUUID(), "N3"], [randomUUID(), "N2"]]);
    expect(levelProgress([a, b], levels, "N3")).toBe(0.5);
    expect(levelProgress([a, b], levels, "N1")).toBe(0);
  });

  it("is the count of Unlevelled items met for an Unlevelled batch, including items with no level at all", () => {
    const a = progress("young");
    const b = progress("young");
    const levels = new Map<string, JlptLevel | null>([[a.studyItemId, null]]);
    expect(levelProgress([a, b], levels, "unlevelled")).toBe(2);
  });
});

describe("the batch on a Generation Request", () => {
  const context = { learnerId: randomUUID(), level: "N3", itemIds: [randomUUID()] } as never;

  it("round-trips through the request's reason", () => {
    expect(contextOf(reasonOf(context))).toEqual(context);
  });

  it("is null for a reason that is not ours or does not parse", () => {
    expect(contextOf("suspended")).toBeNull();
    expect(contextOf("batch-text {not json")).toBeNull();
    expect(contextOf('batch-text {"level":"N9"}')).toBeNull();
  });
});
