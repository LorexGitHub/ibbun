import type { WebRoute, Widget } from "@mojibun/slice";
import { LevelScreen } from "./level.tsx";
import { TodayWidget } from "./today.tsx";

/** The Today screen is the shell's home: the dashboard offers its part of it as a widget. */
export const widgets: Widget[] = [{ slot: "home", component: TodayWidget }];

/** Every JLPT Level has its own page, which the top line and Today link to. */
export const routes: WebRoute[] = [{ path: "/level/:level", component: LevelScreen }];
