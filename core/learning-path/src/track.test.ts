import { describe, expect, it } from "vitest";
import { DEFAULT_ACTIVE_TRACKS, normaliseTracks, parseTrackKey, trackKey, TRACKS } from "./track.ts";

describe("Tracks", () => {
  it("are the 24 type × level pairs, easiest level first, Unlevelled last", () => {
    expect(TRACKS).toHaveLength(24);
    expect(TRACKS.slice(0, 4).map(trackKey)).toEqual(["N5:kanji", "N5:word", "N5:grammar_point", "N5:listening_clip"]);
    expect(TRACKS.at(-1)).toEqual({ level: "unlevelled", type: "listening_clip" });
    expect(DEFAULT_ACTIVE_TRACKS.map(trackKey)).toEqual(TRACKS.slice(0, 4).map(trackKey));
  });

  it("round-trip through their keys and refuse unknown ones", () => {
    for (const t of TRACKS) expect(parseTrackKey(trackKey(t))).toEqual(t);
    expect(() => parseTrackKey("N6:word")).toThrow();
  });

  it("normalise to TRACKS order without duplicates", () => {
    const n3 = { level: "N3", type: "word" } as const;
    const n5 = { level: "N5", type: "kanji" } as const;
    expect(normaliseTracks([n3, n5, { ...n3 }])).toEqual([n5, n3]);
  });
});
