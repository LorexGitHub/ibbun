import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "import",
  nav: { label: "Import", path: "/admin/import" },
  server: async (context) => (await import("./server/index.ts")).default(context),
  web: () => import("./web/index.ts"),
});
