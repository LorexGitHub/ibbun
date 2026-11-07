import { describe, expect, it } from "vitest";
import { shows, switchLanguage } from "../web/explanations.ts";

describe("explanation toggles", () => {
  it("shows a language under its own value and under both", () => {
    expect(shows("english", "english")).toBe(true);
    expect(shows("english", "japanese")).toBe(false);
    expect(shows("japanese", "english")).toBe(false);
    expect(shows("both", "english")).toBe(true);
    expect(shows("both", "japanese")).toBe(true);
  });

  it("turns a language on beside the other, or alone", () => {
    expect(switchLanguage("english", "japanese", true)).toBe("both");
    expect(switchLanguage("japanese", "english", true)).toBe("both");
    expect(switchLanguage("both", "english", true)).toBe("both");
  });

  it("turns a language off while the other stays on", () => {
    expect(switchLanguage("both", "english", false)).toBe("japanese");
    expect(switchLanguage("both", "japanese", false)).toBe("english");
  });

  it("never turns the last language off", () => {
    expect(switchLanguage("english", "english", false)).toBeNull();
    expect(switchLanguage("japanese", "japanese", false)).toBeNull();
  });
});
