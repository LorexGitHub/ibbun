import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "reading",
  nav: { label: "Reading", path: "/reading" },
  server: () => import("./server/index.ts"),
  web: () => import("./web/index.ts"),
});
