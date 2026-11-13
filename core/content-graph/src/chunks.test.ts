import { describe, expect, it, vi } from "vitest";
import { inChunks } from "./postgres.ts";

describe("reading a long id list in chunks", () => {
  it("reads a thousand ids at a time, in order, and not at all for no ids", async () => {
    const read = vi.fn(async (chunk: string[]) => chunk.map((id) => `row ${id}`));
    const ids = Array.from({ length: 2_000 }, (_, i) => `${i}`);
    expect(await inChunks(ids, read)).toEqual(ids.map((id) => `row ${id}`));
    expect(read.mock.calls.map(([chunk]) => chunk.length)).toEqual([1_000, 1_000]);
    read.mockClear();
    expect(await inChunks([], read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});
