import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "learn",
  nav: { label: "Learn", path: "/learn", place: "study", rank: 2, blurb: "Meet new kanji, words and grammar points.", glyph: "新", session: true },
  server: async (ctx) => (await import("./server/learn-server.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
