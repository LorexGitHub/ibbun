import type { WebPart } from "@mojibun/slice";
import { BrowseScreen, ItemScreen } from "./screens.tsx";

export const routes: WebPart["routes"] = [
  { path: "/browse", component: BrowseScreen },
  { path: "/browse/items/:id", component: ItemScreen },
];
