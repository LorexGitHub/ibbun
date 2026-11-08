import { expect, it } from "vitest";
import { routes } from "../web/index.ts";

it("registers the episode list, a Batch Text, a Reading Passage and Practice Texts", () => {
  expect(routes?.map((r) => r.path)).toEqual(["/reading", "/reading/texts/:id", "/reading/passages/:id", "/reading/practice", "/reading/practice/:id"]);
});
