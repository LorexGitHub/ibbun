import type { NavEntry } from "@mojibun/slice";
import { describe, expect, it } from "vitest";
import { dockEntries, doorPath, groups, kanjiAt, levelAt, levelPath, LEVELS, sessionAt, visibleTo, welcomeEntries, type Who } from "./places.ts";

const entry = (label: string, place: NavEntry["place"], extra: Partial<NavEntry> = {}): NavEntry => ({
  label,
  path: `/${label.toLowerCase()}`,
  place,
  blurb: label,
  ...extra,
});

const nav = [
  entry("Approval", "supervisor"),
  entry("Cram", "study", { rank: 4, session: true }),
  entry("Library", "library"),
  entry("Listening", "practice"),
  entry("Reviews", "study", { rank: 1, session: true }),
  entry("Settings", "account"),
  { ...entry("Today", "home"), path: "/" },
];

const learner: Who = { state: "in", learner: { learnerId: "l", email: "l@x.test", role: "learner" } };
const supervisor: Who = { state: "in", learner: { learnerId: "s", email: "s@x.test", role: "supervisor" } };
const labels = (entries: NavEntry[]) => entries.map((e) => e.label);

describe("the app's map", () => {
  it("shows Supervisor screens only to a Supervisor", () => {
    expect(labels(visibleTo(nav, learner))).not.toContain("Approval");
    expect(labels(visibleTo(nav, { state: "out" }))).not.toContain("Approval");
    expect(labels(visibleTo(nav, supervisor))).toContain("Approval");
  });

  it("orders by place, then by rank, so Reviews leads Study", () => {
    expect(labels(visibleTo(nav, supervisor))).toEqual(["Today", "Reviews", "Cram", "Listening", "Library", "Settings", "Approval"]);
  });

  it("puts Today, study, practice and the Library in the dock, but not the account or Supervisor screens", () => {
    expect(labels(dockEntries(visibleTo(nav, supervisor)))).toEqual(["Today", "Reviews", "Cram", "Listening", "Library"]);
  });

  it("shows a visitor study, practice and the Library, but not Today or the account", () => {
    expect(labels(welcomeEntries(visibleTo(nav, { state: "out" })))).toEqual(["Reviews", "Cram", "Listening", "Library"]);
  });

  it("groups entries under their place's heading and leaves out empty places", () => {
    expect(groups(visibleTo(nav, learner)).map((g) => g.heading)).toEqual(["Today", "Study", "Practice", "Library", "Account"]);
  });

  it("knows a session by its path and the paths below it", () => {
    expect(sessionAt(nav, "/reviews")?.label).toBe("Reviews");
    expect(sessionAt(nav, "/reviews/42")?.label).toBe("Reviews");
    expect(sessionAt(nav, "/reviewsish")).toBeUndefined();
    expect(sessionAt(nav, "/listening")).toBeUndefined();
  });

  it("gives each of the five levels its own address, easiest first", () => {
    expect(LEVELS.map(levelPath)).toEqual(["/level/n5", "/level/n4", "/level/n3", "/level/n2", "/level/n1"]);
    expect(levelAt("/level/n3")?.name).toBe("N3");
    expect(levelAt("/level/n3/kanji")?.name).toBe("N3");
    expect(levelAt("/level/n30")).toBeUndefined();
    expect(levelAt("/reviews")).toBeUndefined();
  });

  it("stands the screen's glyph behind it, the level's numeral on a level page, and 文 everywhere else", () => {
    const glyphs = [entry("Reviews", "study", { glyph: "復" }), entry("Library", "library"), { ...entry("Today", "home", { glyph: "今" }), path: "/" }];
    expect(kanjiAt(glyphs, "/reviews")).toBe("復");
    expect(kanjiAt(glyphs, "/reviews/42")).toBe("復");
    expect(kanjiAt(glyphs, "/level/n2")).toBe("二");
    expect(kanjiAt(glyphs, "/library")).toBe("文");
    expect(kanjiAt(glyphs, "/")).toBe("文");
    expect(kanjiAt(glyphs, "/nowhere")).toBe("文");
  });

  it("opens a study or practice door for one level, and leaves every other door as it is", () => {
    const n3 = LEVELS[2];
    expect(doorPath(entry("Reviews", "study"), n3)).toBe("/reviews?level=n3");
    expect(doorPath(entry("Listening", "practice"), n3)).toBe("/listening?level=n3");
    expect(doorPath(entry("Reviews", "study"))).toBe("/reviews");
    expect(doorPath(entry("Library", "library"), n3)).toBe("/library");
    expect(doorPath(entry("Settings", "account"), n3)).toBe("/settings");
    expect(doorPath(entry("Approval", "supervisor"), n3)).toBe("/approval");
    expect(doorPath({ ...entry("Today", "home"), path: "/" }, n3)).toBe("/");
  });
});
