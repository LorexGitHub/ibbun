import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "cram",
  nav: { label: "Cram", path: "/cram" },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
