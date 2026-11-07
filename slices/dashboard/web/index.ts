import type { Widget } from "@mojibun/slice";
import { TodayWidget } from "./today.tsx";

/** The Today screen is the shell's home: the dashboard offers its part of it as a widget. */
export const widgets: Widget[] = [{ slot: "home", component: TodayWidget }];
