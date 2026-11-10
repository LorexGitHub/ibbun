import { describe, expect, it } from "vitest";
import { checkSlices, defineSlice, loadServerParts, type ServerContext } from "./slice.ts";

const ctx = {} as ServerContext;

describe("slices", () => {
  it("sorts slices by name", () => {
    const sorted = checkSlices([defineSlice({ name: "reviews" }), defineSlice({ name: "learn" })]);
    expect(sorted.map((s) => s.name)).toEqual(["learn", "reviews"]);
  });

  it("rejects two slices with one name", () => {
    expect(() => checkSlices([{ name: "learn" }, { name: "learn" }])).toThrow(/two slices are called "learn"/);
  });

  it("rejects a name that cannot be a URL segment", () => {
    expect(() => defineSlice({ name: "Learn Now" })).toThrow(/slice name/);
  });

  it("loads the server part, and treats a slice without one as empty", async () => {
    const parts = await loadServerParts([
      { name: "a", server: async () => ({ jobs: [] }) },
      { name: "b" },
    ], ctx);
    expect(parts.map((p) => p.part)).toEqual([{ jobs: [] }, {}]);
  });
});
