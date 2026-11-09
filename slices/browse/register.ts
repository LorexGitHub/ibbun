import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "browse",
  nav: { label: "Library", path: "/browse", place: "library", blurb: "Look up any kanji, word or grammar point.", glyph: "辞" },
  server: async (ctx) => (await import("./server/index.ts")).createServerPart(ctx),
  web: () => import("./web/index.ts"),
});
