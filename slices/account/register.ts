import { defineSlice } from "@ibbun/slice";

export default defineSlice({
  name: "account",
  nav: { label: "Settings", path: "/settings", place: "account", blurb: "Appearance, email, password, furigana and where you are logged in.", glyph: "設" },
  web: () => import("./web/index.ts"),
});
