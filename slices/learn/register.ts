import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "learn",
  nav: { label: "Learn", path: "/learn" },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
