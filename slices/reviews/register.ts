import { defineSlice } from "@ibbun/slice";

export default defineSlice({
  name: "reviews",
  nav: { label: "Reviews", path: "/reviews", place: "study", rank: 1, blurb: "Answer what's due before you forget it.", glyph: "復", session: true },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
