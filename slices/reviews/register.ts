import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "reviews",
  nav: { label: "Reviews", path: "/reviews" },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
