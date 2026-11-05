import type { Slice } from "@mojibun/slice";

const slice: Slice = {
  name: "sample",
  nav: { label: "Sample", path: "/sample" },
  server: () => import("./server/index.ts"),
  web: () => import("./web.ts"),
};

export default slice;
