import { createElement } from "react";
import { CreditsPage } from "./credits-page.tsx";

export const routes = [{ path: "/credits", component: () => createElement(CreditsPage) }];
