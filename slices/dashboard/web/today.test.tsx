// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { onGoTo } from "@mojibun/ui";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Today } from "../contract.ts";
import slice from "../register.ts";
import { MasteryByLevel, TodayHero, TodayWidget } from "./today.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const today: Today = {
  due: { total: 18, kanji: 11, word: 5, grammarPoint: 2 },
  streakDays: 42,
  levels: [
    { level: "N5", known: 92, total: 100 },
    { level: "N4", known: 41, total: 100 },
    { level: "N3", known: 6, total: 100 },
    { level: "N2", known: 0, total: 100 },
    { level: "N1", known: 0, total: 100 },
  ],
  batchSize: 5,
};

/** A figure's text without the stylesheet NumberFlow puts inside it. */
const figText = (fig: Element | undefined) => {
  const copy = fig?.cloneNode(true) as Element | undefined;
  copy?.querySelectorAll("style").forEach((s) => s.remove());
  return copy?.textContent;
};

const answer = (status: number, body?: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("TodayHero", () => {
  const heading = () => figText(screen.getByRole("heading", { level: 1 }));
  const accent = () => document.querySelector(".btn--primary");

  it("greets the Learner, shows the streak and how many Reviews are waiting", () => {
    render(<TodayHero today={today} hour={19} />);
    expect(screen.getByText("Good evening · 42 days in a row")).toBeTruthy();
    expect(heading()).toBe("18 reviews due");
    expect(screen.getByText("reviews wait for you.")).toBeTruthy();
    expect(screen.getByText("11 kanji, 5 words and 2 grammar points.")).toBeTruthy();
  });

  it("makes Start Reviews the accent button while anything is due, with a Learn batch beside it", () => {
    render(<TodayHero today={today} hour={19} />);
    expect(accent()?.textContent).toMatch(/^Start Reviews/);
    expect(accent()?.getAttribute("href")).toBe("/reviews");
    expect(screen.getByRole("link", { name: "Learn 5 new" }).getAttribute("href")).toBe("/learn");
  });

  it("makes the Learn batch the accent button once nothing is due, sized as the Learner set it", () => {
    render(<TodayHero today={{ ...today, batchSize: 8, due: { total: 0, kanji: 0, word: 0, grammarPoint: 0 } }} hour={19} />);
    expect(accent()?.textContent).toMatch(/^Learn 8 new/);
    expect(accent()?.getAttribute("href")).toBe("/learn");
    expect(screen.getByRole("link", { name: "Start Reviews" }).getAttribute("href")).toBe("/reviews");
  });

  it("says nothing is due when nothing is", () => {
    render(<TodayHero today={{ ...today, due: { total: 0, kanji: 0, word: 0, grammarPoint: 0 }, streakDays: 1 }} hour={8} />);
    expect(screen.getByText("Good morning · 1 day in a row")).toBeTruthy();
    expect(screen.getByText("Nothing waits for you today.")).toBeTruthy();
    expect(screen.getByText("You're all caught up.")).toBeTruthy();
  });

  it("leaves out the types with nothing due, uses the singular, and drops a zero streak", () => {
    render(<TodayHero today={{ ...today, due: { total: 1, kanji: 0, word: 1, grammarPoint: 0 }, streakDays: 0 }} hour={13} />);
    expect(screen.getByText("Good afternoon")).toBeTruthy();
    expect(heading()).toBe("1 review due");
    expect(screen.getByText("review waits for you.")).toBeTruthy();
    expect(screen.getByText("1 word.")).toBeTruthy();
  });

  it("opens the command menu from Where to?", () => {
    const open = vi.fn();
    const stop = onGoTo(open);
    render(<TodayHero today={today} hour={9} />);
    fireEvent.click(screen.getByRole("button", { name: /Where to\?/ }));
    stop();
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("MasteryByLevel", () => {
  it("shows every JLPT Level with its share known, and where the Learner is now", () => {
    render(<MasteryByLevel levels={today.levels} />, { wrapper: MemoryRouter });
    expect(screen.getByRole("heading", { name: "Your way up to N1" })).toBeTruthy();
    expect(screen.getByText("You're 41% through N4, and nothing is locked.")).toBeTruthy();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual(["N592% · 100 items", "N441% · 100 items", "N36%", "N2not started", "N1not started"]);
    expect(items.map((i) => i.className)).toEqual(["level done", "level now", "level next", "level far", "level farther"]);
  });

  it("makes every level a link to its own page", () => {
    render(<MasteryByLevel levels={today.levels} />, { wrapper: MemoryRouter });
    const links = within(screen.getByRole("list")).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/level/n5", "/level/n4", "/level/n3", "/level/n2", "/level/n1"]);
    expect(links[0]?.textContent).toBe("N592% · 100 items");
  });
});

describe("TodayWidget", () => {
  it("loads Today from the API and shows it", async () => {
    answer(200, today);
    render(<TodayWidget />, { wrapper: MemoryRouter });
    expect(figText(await screen.findByRole("heading", { level: 1 }))).toBe("18 reviews due");
    expect(fetch).toHaveBeenCalledWith("/api/dashboard/today", { credentials: "same-origin" });
  });

  it("asks a logged-out visitor to log in", async () => {
    answer(401, { message: "log in first" });
    render(<TodayWidget />, { wrapper: MemoryRouter });
    expect((await screen.findByRole("alert")).textContent).toBe("Log in to see your day.");
  });

  it("says so when the API fails", async () => {
    answer(500, {});
    render(<TodayWidget />, { wrapper: MemoryRouter });
    expect((await screen.findByRole("alert")).textContent).toMatch(/didn't load/);
  });

  it("says so when the request never arrives", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    render(<TodayWidget />, { wrapper: MemoryRouter });
    expect((await screen.findByRole("alert")).textContent).toMatch(/didn't load/);
  });
});

describe("register", () => {
  it("puts Today in the nav, offers the home screen its widget and gives every level its page", async () => {
    expect(slice.name).toBe("dashboard");
    expect(slice.nav).toMatchObject({ label: "Today", path: "/", place: "home" });
    const web = await slice.web!();
    expect(web.widgets?.map((w) => w.slot)).toEqual(["home"]);
    expect(web.routes?.map((r) => r.path)).toEqual(["/level/:level"]);
  });
});
