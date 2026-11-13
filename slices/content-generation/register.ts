import { defineSlice } from "@ibbun/slice";

export default defineSlice({
  name: "content-generation",
  server: () => import("./server/index.ts"),
});
