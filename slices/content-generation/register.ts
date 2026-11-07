import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "content-generation",
  server: () => import("./server/index.ts"),
});
