import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "browse",
  nav: { label: "Browse", path: "/browse" },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
