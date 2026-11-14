import { defineSlice } from "@ibbun/slice";

export default defineSlice({
  name: "reading",
  nav: { label: "Reading", path: "/reading", place: "practice", blurb: "Short texts built from what you already know.", glyph: "読" },
  server: () => import("./server/index.ts"),
  web: () => import("./web/index.ts"),
});
