import { defineSlice } from "@ibbun/slice";

export default defineSlice({
  name: "import",
  nav: { label: "Import", path: "/admin/import", place: "supervisor", blurb: "Dictionary import runs and their reports." },
  server: async (context) => (await import("./server/import-server.ts")).default(context),
  web: () => import("./web/index.ts"),
});
