import type { WebPart } from "@ibbun/slice";
import { PlacementScreen } from "./PlacementScreen.tsx";

export const routes: WebPart["routes"] = [{ path: "/placement", component: PlacementScreen }];
