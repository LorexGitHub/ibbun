import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { Slice } from "@mojibun/slice";
import { App, Slot } from "./App.tsx";
import { buildShell, discoverSlices } from "./slices.ts";

const modules = import.meta.glob<{ default: Slice }>("../../../scripts/fixtures/root/slices/*/register.ts", {
  eager: true,
});

describe("web shell", () => {
  it("discovers slices with a glob import and builds nav, routes and widgets from them", async () => {
    const shell = await buildShell(discoverSlices(modules));
    expect(shell.nav).toEqual([{ label: "Sample", path: "/sample" }]);
    expect(shell.routes.map((r) => r.path)).toEqual(["/sample"]);
    expect(shell.widgets.map((w) => w.slot)).toEqual(["dashboard"]);
  });

  it("shows the slice's screen at its route and a link to it in the nav", async () => {
    const shell = await buildShell(discoverSlices(modules));
    const html = renderToString(
      <StaticRouter location="/sample">
        <App shell={shell} />
      </StaticRouter>,
    );
    expect(html).toContain("sample screen");
    expect(html).toContain('href="/sample"');
    expect(html).toContain('class="pill pill--ink"');
  });

  it("frames every screen with the EDRDG footer", async () => {
    const shell = await buildShell(discoverSlices(modules));
    const html = renderToString(
      <StaticRouter location="/nowhere">
        <App shell={shell} />
      </StaticRouter>,
    );
    expect(html).toContain("Electronic Dictionary Research and Development Group");
  });

  it("renders the widgets a slice registered for a slot", async () => {
    const shell = await buildShell(discoverSlices(modules));
    expect(renderToString(<Slot shell={shell} name="dashboard" />)).toContain("sample widget");
    expect(renderToString(<Slot shell={shell} name="other" />)).toBe("");
  });
});
