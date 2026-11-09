import { defineSlice } from "@mojibun/slice";

export default defineSlice({
  name: "account",
  nav: { label: "Settings", path: "/settings", place: "account", blurb: "Email, password, furigana and where you are logged in." },
  web: () => import("./web/index.ts"),
});
