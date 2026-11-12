import { describe, expect, it } from "vitest";
import type { LevelPage } from "../contract.ts";
import { levelDoors, levelHref, TRACKS } from "./doors.ts";

const page: LevelPage = {
  level: "N4",
  kanji: { total: 80, known: 12 },
  word: { total: 600, known: 40 },
  grammarPoint: { total: 120, known: 0 },
  due: 3,
  clips: 4,
};

describe("levelHref", () => {
  it("is the level's own address, in lower case", () => {
    expect(levelHref("N4")).toBe("/level/n4");
  });
});

describe("TRACKS", () => {
  it("names Kanji, Words and Grammar in that order", () => {
    expect(TRACKS.map((t) => [t.label, t.of(page)])).toEqual([
      ["Kanji", page.kanji],
      ["Words", page.word],
      ["Grammar", page.grammarPoint],
    ]);
  });
});

describe("levelDoors", () => {
  it("lists Reviews, Learn, Reading, Listening and Placement, each opened for this level", () => {
    expect(levelDoors(page).map((d) => [d.label, d.href])).toEqual([
      ["Reviews", "/reviews?level=n4"],
      ["Learn", "/learn?level=n4"],
      ["Reading", "/reading?level=n4"],
      ["Listening", "/listening?level=n4"],
      ["Placement", "/placement?level=n4"],
    ]);
  });

  it("gives each door its glyph and what waits behind it", () => {
    expect(levelDoors(page).map((d) => [d.glyph, d.note])).toEqual([
      ["復", "3 due"],
      ["新", "748 not yet Known"],
      ["読", "Short texts built from what you know"],
      ["聞", "4 clips"],
      ["測", "Mark what you already know"],
    ]);
  });

  it("says so when nothing is due, everything is Known and there is one clip or none", () => {
    const settled = { total: 2, known: 2 };
    const notes = (p: LevelPage) => levelDoors(p).map((d) => d.note);
    expect(notes({ ...page, kanji: settled, word: settled, grammarPoint: settled, due: 0, clips: 0 })).toEqual([
      "nothing due",
      "all Known",
      "Short texts built from what you know",
      "no clips yet",
      "Mark what you already know",
    ]);
    expect(notes({ ...page, clips: 1 })[3]).toBe("1 clip");
  });
});
