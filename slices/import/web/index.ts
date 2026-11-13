import type { WebPart } from "@ibbun/slice";
import { ReportScreen } from "./ReportScreen.tsx";

export const routes: NonNullable<WebPart["routes"]> = [{ path: "/admin/import", component: ReportScreen }];
