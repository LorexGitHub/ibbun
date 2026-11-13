import { defineSlice } from "@ibbun/slice";

export default defineSlice({
  name: "dashboard",
  nav: { label: "Today", path: "/", place: "home", blurb: "What's due, your streak and your way up.", glyph: "今" },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
