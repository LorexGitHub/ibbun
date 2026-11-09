import type { NavEntry } from "@mojibun/slice";
import { describe, expect, it } from "vitest";
import { barEntries, groups, sessionAt, todayEntries, visibleTo, type Who } from "./places.ts";

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

  it("keeps the bar to Today, practice and the Library", () => {
    expect(labels(barEntries(visibleTo(nav, learner)))).toEqual(["Today", "Listening", "Library"]);
  });

  it("puts study, practice and the Library on Today, but not Today itself or the account", () => {
    expect(labels(todayEntries(visibleTo(nav, learner)))).toEqual(["Reviews", "Cram", "Listening", "Library"]);
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
});
