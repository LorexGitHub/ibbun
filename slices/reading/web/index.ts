import type { WebPart } from "@ibbun/slice";
import { PracticeScreen, PracticeTextScreen } from "../practice/web/PracticeScreens.tsx";
import { BatchTextScreen, EpisodesScreen, PassageScreen } from "./screens.tsx";

export const routes: WebPart["routes"] = [
  { path: "/reading", component: EpisodesScreen },
  { path: "/reading/texts/:id", component: BatchTextScreen },
  { path: "/reading/passages/:id", component: PassageScreen },
  { path: "/reading/practice", component: PracticeScreen },
  { path: "/reading/practice/:id", component: PracticeTextScreen },
];
