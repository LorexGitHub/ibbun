import { describe, expect, it } from "vitest";
import { once, required } from "./lazy.ts";

describe("once", () => {
  it("builds nothing until asked, and only once", () => {
    let built = 0;
    const get = once(() => ++built);
    expect(built).toBe(0);
    expect([get(), get()]).toEqual([1, 1]);
    expect(built).toBe(1);
  });
});

describe("required", () => {
  it("returns a setting that is set and names one that is not", () => {
    expect(required({ A: "x" }, "A")).toBe("x");
    expect(() => required({ A: "" }, "A")).toThrow("A is not set");
    expect(() => required({}, "B")).toThrow("B is not set");
  });
});
