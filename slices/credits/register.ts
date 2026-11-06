import { defineSlice } from "@mojibun/slice";

// No nav entry: the footer on every Learner screen links to /credits.
export default defineSlice({
  name: "credits",
  server: () => import("./server/index.ts"),
  web: () => import("./web/index.ts"),
});
