import { defineSlice } from "@ibbun/slice";

export default defineSlice({
  name: "content-approval",
  nav: { label: "Approval", path: "/admin/content-approval", place: "supervisor", blurb: "Check drafts before Learners see them." },
  server: () => import("./server/index.ts"),
  web: () => import("./web.tsx"),
});
