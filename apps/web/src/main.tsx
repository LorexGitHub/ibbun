import "@mojibun/ui/styles.css";
import "./index.css";
import "./shell.css";
import { applyTheme } from "@mojibun/ui";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App.tsx";
import { buildShell, discoverSlices } from "./slices.ts";

const modules = import.meta.glob<{ default: import("@mojibun/slice").Slice }>("../../../slices/*/register.ts", {
  eager: true,
});

applyTheme();
const shell = await buildShell(discoverSlices(modules));
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App shell={shell} />
  </BrowserRouter>,
);
