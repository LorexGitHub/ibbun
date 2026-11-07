import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "dashboard",
  nav: { label: "Today", path: "/" },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
