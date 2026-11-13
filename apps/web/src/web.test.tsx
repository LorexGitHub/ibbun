import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { Slice } from "@ibbun/slice";
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
        <App shell={shell} initialWho={{ state: "in", learner: { learnerId: "l", email: "l@x.test", role: "learner" } }} />
      </StaticRouter>,
    );
    expect(html).toContain("sample screen");
    expect(html).toContain('aria-label="Sample" aria-current="page" class="dock-link active" href="/sample"');
  });

  it("keeps the five levels and the Where to? field in the top line for a logged-in Learner", async () => {
    const shell = await buildShell(discoverSlices(modules));
    const at = (who: Who, location = "/sample") =>
      renderToString(
        <StaticRouter location={location}>
          <App shell={shell} initialWho={who} />
        </StaticRouter>,
      );
    const learner: Who = { state: "in", learner: { learnerId: "l", email: "l@x.test", role: "learner" } };
    expect(at(learner)).toContain('<nav aria-label="Levels"');
    expect(at(learner)).toContain('class="level-link" href="/level/n5"');
    expect(at(learner, "/level/n1")).toContain('aria-current="page" class="level-link active" href="/level/n1"');
    expect(at(learner)).toContain('class="where-to"');
    expect(at({ state: "out" })).not.toContain("/level/n5");
    expect(at({ state: "out" })).toContain('class="where-to"');
    expect(at({ state: "loading" })).not.toContain("/level/n5");
  });

  it("stands the screen's kanji in the background", async () => {
    const shell = await buildShell(discoverSlices(modules));
    const at = (location: string) =>
      renderToString(
        <StaticRouter location={location}>
          <App shell={shell} initialWho={{ state: "in", learner: { learnerId: "l", email: "l@x.test", role: "learner" } }} />
        </StaticRouter>,
      );
    expect(at("/sample")).toContain('<span class="app-kanji" lang="ja" aria-hidden="true">文</span>');
    expect(at("/level/n4")).toContain('<span class="app-kanji" lang="ja" aria-hidden="true">四</span>');
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

  it("gives a visitor the screen a slice registered as the welcome, in place of its own line", async () => {
    const door: Slice = { name: "door", web: async () => ({ widgets: [{ slot: "welcome", component: () => <p>the way in</p> }] }) };
    const shell = await buildShell(discoverSlices({ ...modules, door: { default: door } }));
    const home = (who: Who) =>
      renderToString(
        <StaticRouter location="/">
          <App shell={shell} initialWho={who} />
        </StaticRouter>,
      );
    const visitor = home({ state: "out" });
    expect(visitor).toContain("the way in");
    expect(visitor).not.toContain("One sentence at a time.");
    expect(visitor).toContain("What&#x27;s inside");
    expect(home({ state: "in", learner: { learnerId: "l", email: "l@x.test", role: "learner" } })).not.toContain("the way in");
  });

  it("keeps its own line for a visitor when no slice registered a welcome", async () => {
    const shell = await buildShell(discoverSlices(modules));
    const html = renderToString(
      <StaticRouter location="/">
        <App shell={shell} initialWho={{ state: "out" }} />
      </StaticRouter>,
    );
    expect(html).toContain("One sentence at a time.");
  });

  it("shows the dock only to a logged-in Learner", async () => {
    const shell = await buildShell(discoverSlices(modules));
    const at = (who: Who) =>
      renderToString(
        <StaticRouter location="/sample">
          <App shell={shell} initialWho={who} />
        </StaticRouter>,
      );
    expect(at({ state: "in", learner: { learnerId: "l", email: "l@x.test", role: "learner" } })).toContain("dock-link");
    expect(at({ state: "out" })).not.toContain("dock-link");
    expect(at({ state: "loading" })).not.toContain("dock-link");
  });

  it("swaps the map for a way back to Today inside a session", async () => {
    const session: Slice = { name: "drill", nav: { label: "Drill", path: "/drill", place: "study", blurb: "Drill.", glyph: "練", session: true } };
    const shell = await buildShell(discoverSlices({ ...modules, drill: { default: session } }));
    const html = renderToString(
      <StaticRouter location="/drill">
        <App shell={shell} initialWho={{ state: "in", learner: { learnerId: "l", email: "l@x.test", role: "learner" } }} />
      </StaticRouter>,
    );
    expect(html).toContain("Done for now");
    expect(html).not.toContain('href="/sample"');
    expect(html).not.toContain("/level/n5");
    expect(html).not.toContain('class="where-to"');
    expect(html).toContain('id="session-count"');
    expect(html).toContain('<span class="app-kanji" lang="ja" aria-hidden="true">練</span>');
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
