import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "listening",
  nav: { label: "Listening", path: "/listening" },
  server: () => import("./server/listening-mount.ts"),
  web: () => import("./web/index.ts"),
});
