import { createElement } from "react";

export const routes = [{ path: "/sample", component: () => createElement("p", null, "sample screen") }];
export const widgets = [{ slot: "dashboard", component: () => createElement("p", null, "sample widget") }];
