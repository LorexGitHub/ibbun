import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "cram",
  nav: { label: "Cram", path: "/cram" },
  server: () => import("./server/index.ts"),
  web: () => import("./web/index.ts"),
});
