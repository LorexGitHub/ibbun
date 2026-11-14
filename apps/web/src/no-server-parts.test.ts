import { describe, expect, it } from "vitest";
import { noServerParts } from "./no-server-parts.ts";

const resolveId = noServerParts.resolveId as (source: string, importer?: string) => string | null;
const load = noServerParts.load as (id: string) => string | null;

describe("the production build's view of a slice's server part", () => {
  it("replaces a server part a slice's register.ts imports with an empty module", () => {
    const id = resolveId("./server/learn-server.ts", "/repo/slices/learn/register.ts");
    expect(id).toBeTruthy();
    expect(load(id!)).toBe("export default undefined;");
  });

  it("leaves the web part, other imports and other importers alone", () => {
    expect(resolveId("./web/index.ts", "/repo/slices/learn/register.ts")).toBeNull();
    expect(resolveId("@ibbun/slice", "/repo/slices/learn/register.ts")).toBeNull();
    expect(resolveId("./server/learn-server.ts", "/repo/slices/learn/web/index.ts")).toBeNull();
    expect(resolveId("./server/learn-server.ts", undefined)).toBeNull();
  });

  it("loads nothing for any other module", () => {
    expect(load("/repo/slices/learn/register.ts")).toBeNull();
  });

  it("applies to builds only", () => {
    expect(noServerParts.apply).toBe("build");
  });
});
