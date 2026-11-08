import { expect, it } from "vitest";
import { routes } from "../web/index.ts";

it("registers the episode list, a Batch Text and a Reading Passage", () => {
  expect(routes?.map((r) => r.path)).toEqual(["/reading", "/reading/texts/:id", "/reading/passages/:id"]);
});
