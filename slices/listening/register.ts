import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "listening",
  nav: { label: "Listening", path: "/listening", place: "practice", blurb: "Hear spoken Japanese and answer what you heard.", glyph: "聞" },
  server: () => import("./server/listening-mount.ts"),
  web: () => import("./web/index.ts"),
});
