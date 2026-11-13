import { describe, expect, it } from "vitest";
import type { Word } from "@ibbun/content-graph";
import { lookupView } from "../server/reading-api.ts";

const word = (parts: Partial<Pick<Word, "forms" | "readings" | "senses">>): Word =>
  ({ forms: [], readings: [], senses: [], ...parts }) as unknown as Word;
const sense = (...glosses: string[]) => ({ glosses }) as Word["senses"][number];

describe("lookupView", () => {
  it("names the Word by its first written form, with its first reading", () => {
    const view = lookupView(word({ forms: [{ id: "1", text: "食べる" }], readings: [{ id: "2", text: "たべる", pitchAccent: null }], senses: [sense("to eat")] }));
    expect(view).toEqual({ label: "食べる", reading: "たべる", meanings: ["to eat"] });
  });

  it("falls back to the reading when the Word has no written form", () => {
    const view = lookupView(word({ readings: [{ id: "2", text: "ええ", pitchAccent: null }], senses: [sense("yes")] }));
    expect(view).toMatchObject({ label: "ええ", reading: "ええ" });
  });

  it("has an empty label and no reading when there is neither", () => {
    expect(lookupView(word({}))).toEqual({ label: "", reading: null, meanings: [] });
  });

  it("gathers glosses across senses and keeps the first four", () => {
    const view = lookupView(word({ senses: [sense("a", "b", "c"), sense("d", "e")] }));
    expect(view.meanings).toEqual(["a", "b", "c", "d"]);
  });
});
