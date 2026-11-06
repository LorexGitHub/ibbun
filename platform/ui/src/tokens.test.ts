import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR 0011: the mock's :root tokens are copied, never re-derived.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const declarations = (css: string) =>
  new Map([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));

describe("tokens.css", () => {
  it("holds every token of the mock with the mock's value", () => {
    const mock = read("../../../docs/design/mojibun-mock.html");
    const rootBlocks = [...mock.matchAll(/:root \{([\s\S]*?)\n\}/g)].map(([, body]) => body).join("\n");
    const fromMock = declarations(rootBlocks);
    const tokens = declarations(read("./tokens.css"));
    expect(fromMock.size).toBeGreaterThan(40);
    for (const [name, value] of fromMock) expect(tokens.get(name), name).toBe(value);
  });
});
