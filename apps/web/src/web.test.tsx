import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { Slice } from "@mojibun/slice";
import { App, Slot } from "./App.tsx";
import type { Who } from "./places.ts";
import { buildShell, discoverSlices } from "./slices.ts";

const modules = import.meta.glob<{ default: Slice }>("../../../scripts/fixtures/root/slices/*/register.ts", {
  eager: true,
});

describe("web shell", () => {
  it("discovers slices with a glob import and builds nav, routes and widgets from them", async () => {
    const shell = await buildShell(discoverSlices(modules));
    expect(shell.nav).toEqual([{ label: "Sample", path: "/sample", place: "practice", blurb: "A sample screen." }]);
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
    expect(html).toContain('aria-label="Sample" aria-current="page" class="dock-link active" href="/sample"');
  });

  it("welcomes a visitor with a way to sign up and log in instead of an empty Today", async () => {
    const shell = await buildShell(discoverSlices(modules));
    const html = renderToString(
      <StaticRouter location="/">
        <App shell={shell} initialWho={{ state: "out" }} />
      </StaticRouter>,
    );
    expect(html).toContain('href="/signup"');
    expect(html).toContain('href="/login"');
    expect(html).toContain("What&#x27;s inside");
  });

  it("swaps the map for a way back to Today inside a session", async () => {
    const session: Slice = { name: "drill", nav: { label: "Drill", path: "/drill", place: "study", blurb: "Drill.", session: true } };
    const shell = await buildShell(discoverSlices({ ...modules, drill: { default: session } }));
    const html = renderToString(
      <StaticRouter location="/drill">
        <App shell={shell} initialWho={{ state: "out" }} />
      </StaticRouter>,
    );
    expect(html).toContain("Done for now");
    expect(html).not.toContain('href="/sample"');
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

  it("shows the welcome only to a visitor, and nothing while the session is unknown", async () => {
    const shell = await buildShell(discoverSlices(modules));
    const home = (who: Who) =>
      renderToString(
        <StaticRouter location="/">
          <App shell={shell} initialWho={who} />
        </StaticRouter>,
      );
    const learner: Who = { state: "in", learner: { learnerId: "l", email: "l@x.test", role: "learner" } };
    expect(home({ state: "out" })).toContain("What&#x27;s inside");
    expect(home(learner)).not.toContain("What&#x27;s inside");
    expect(home({ state: "loading" })).not.toContain("What&#x27;s inside");
    expect(home({ state: "loading" })).not.toContain('href="/signup"');
  });

  it("renders the widgets a slice registered for a slot", async () => {
    const shell = await buildShell(discoverSlices(modules));
    expect(renderToString(<Slot shell={shell} name="dashboard" />)).toContain("sample widget");
    expect(renderToString(<Slot shell={shell} name="other" />)).toBe("");
  });
});
