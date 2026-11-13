import { describe, expect, it } from "vitest";
import { createFakeContentGraph } from "@ibbun/content-graph/testing";
import { world } from "./world.ts";

describe("the slice's test world", () => {
  it("labels its Word by the Kanji form 食べる", async () => {
    expect((await createFakeContentGraph(world().graph).search("食べる")).map((s) => s.label)).toContain("食べる");
  });
});
