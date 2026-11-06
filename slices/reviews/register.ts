import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "reviews",
  nav: { label: "Reviews", path: "/reviews" },
  server: () => import("./server/index.ts"),
  web: () => import("./web/index.ts"),
});
