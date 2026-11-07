import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "listening",
  nav: { label: "Listening", path: "/listening" },
  server: () => import("./server/index.ts"),
  web: () => import("./web/index.ts"),
});
