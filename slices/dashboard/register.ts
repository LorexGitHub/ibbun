import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "dashboard",
  nav: { label: "Today", path: "/" },
  server: () => import("./server/index.ts"),
  web: () => import("./web/index.ts"),
});
