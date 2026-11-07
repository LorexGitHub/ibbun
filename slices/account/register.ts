import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "account",
  nav: { label: "Settings", path: "/settings" },
  web: () => import("./web/index.ts"),
});
