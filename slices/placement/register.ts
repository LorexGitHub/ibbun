import { defineSlice } from "@ibbun/slice";

export default defineSlice({
  name: "placement",
  nav: { label: "Placement", path: "/placement", place: "study", rank: 3, blurb: "Mark what you already know at a JLPT level, so it skips the queue.", glyph: "測", session: true },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
