import { describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@ibbun/auth";
import { createDb } from "@ibbun/db";
import slice from "../register.ts";

describe("the cram slice as the API shell mounts it", () => {
  it("is registered as `cram`, with a nav entry and both parts", async () => {
    expect(slice).toMatchObject({ name: "cram", nav: { label: "Cram", path: "/cram" } });
    const part = await slice.server!({ db: createDb("postgres://x:x@localhost:1/x", { max: 1 }), sessions: createFakeSessionResolver() });
    expect(part.api).toBeDefined();
    expect((await slice.web!()).routes?.map((r) => r.path)).toEqual(["/cram"]);
  });

  it("guards its routes with the shell's sessions", async () => {
    const part = await slice.server!({ db: createDb("postgres://x:x@localhost:1/x", { max: 1 }), sessions: createFakeSessionResolver() });
    expect((await part.api!.request("/items?level=N5")).status).toBe(401);
  });
});
