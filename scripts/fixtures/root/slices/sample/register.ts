import type { Slice } from "@ibbun/slice";

const slice: Slice = {
  name: "sample",
  nav: { label: "Sample", path: "/sample", place: "practice", blurb: "A sample screen." },
  server: () => import("./server/index.ts"),
  web: () => import("./web.ts"),
};

export default slice;
