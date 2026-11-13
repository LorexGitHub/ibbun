import { defineSlice } from "@ibbun/slice";

export default defineSlice({
  name: "cram",
  nav: { label: "Cram", path: "/cram", place: "study", rank: 4, blurb: "Practise items you pick. Your Mastery stays as it is.", glyph: "詰", session: true },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
