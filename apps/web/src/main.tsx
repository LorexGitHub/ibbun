import "@ibbun/ui/styles.css";
import "./index.css";
import "./shell.css";
import { applyTheme } from "@ibbun/ui";
import { isShowcase } from "@ibbun/shared";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App.tsx";
import { buildShell, discoverSlices } from "./slices.ts";

const modules = import.meta.glob<{ default: import("@ibbun/slice").Slice }>("../../../slices/*/register.ts", {
  eager: true,
});

applyTheme();
const shell = await buildShell(discoverSlices(modules, isShowcase(import.meta.env.VITE_SHOWCASE)));
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App shell={shell} />
  </BrowserRouter>,
);
