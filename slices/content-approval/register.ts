import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "content-approval",
  nav: { label: "Approval", path: "/admin/content-approval" },
  server: () => import("./server/index.ts"),
  web: () => import("./web.tsx"),
});
