import type { WebPart } from "@mojibun/slice";
import { BatchTextScreen, EpisodesScreen, PassageScreen } from "./screens.tsx";

export const routes: WebPart["routes"] = [
  { path: "/reading", component: EpisodesScreen },
  { path: "/reading/texts/:id", component: BatchTextScreen },
  { path: "/reading/passages/:id", component: PassageScreen },
];
