import type { WebPart } from "@mojibun/slice";
import { PlacementScreen } from "./PlacementScreen.tsx";

export const routes: WebPart["routes"] = [{ path: "/placement", component: PlacementScreen }];
