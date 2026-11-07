import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "placement",
  nav: { label: "Placement", path: "/placement" },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
