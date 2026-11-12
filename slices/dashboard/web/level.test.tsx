// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LevelPage } from "../contract.ts";
import { routes } from "./index.ts";
import { LevelView } from "./level.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const n4: LevelPage = {
  level: "N4",
  kanji: { total: 80, known: 12 },
  word: { total: 600, known: 40 },
  grammarPoint: { total: 0, known: 0 },
  due: 3,
  clips: 4,
};

const answer = (status: number, body?: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/level/n5">to N5</Link>
      <Routes>
        {routes.map((r) => (
          <Route key={r.path} path={r.path} element={<r.component />} />
        ))}
        <Route path="/" element={<p>Today</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("LevelView", () => {
  it("shows the level's name large, and progress for Kanji, Words and Grammar", () => {
    render(<LevelView page={n4} />, { wrapper: MemoryRouter });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("N4");
    const rows = within(screen.getByRole("list", { name: "Progress" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["Kanji12 of 80 Known · 15%", "Words40 of 600 Known · 6%", "Grammar0 of 0 Known · 0%"]);
    expect(rows.map((r) => (r.querySelector(".level-bar span") as HTMLElement).style.width)).toEqual(["15%", "6%", "0%"]);
  });

  it("lists the five doors with what waits behind each", () => {
    render(<LevelView page={n4} />, { wrapper: MemoryRouter });
    const doors = within(screen.getByRole("navigation", { name: "Doors at N4" })).getAllByRole("link");
    expect(doors.map((d) => d.getAttribute("href"))).toEqual(["/reviews?level=n4", "/learn?level=n4", "/reading?level=n4", "/listening?level=n4", "/placement?level=n4"]);
    expect(doors[0]?.textContent).toBe("復Reviews3 due");
  });
});

describe("LevelScreen", () => {
  it("loads the level in the address from the API", async () => {
    answer(200, n4);
    open("/level/n4");
    expect(screen.getByRole("status").textContent).toBe("Loading N4…");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("N4");
    expect(fetch).toHaveBeenCalledWith("/api/dashboard/levels/n4", { credentials: "same-origin" });
  });

  it("loads the other level when the Learner moves to it", async () => {
    answer(200, n4);
    open("/level/n4");
    await screen.findByRole("heading", { level: 1 });
    answer(200, { ...n4, level: "N5" });
    fireEvent.click(screen.getByRole("link", { name: "to N5" }));
    expect(screen.getByRole("status").textContent).toBe("Loading N5…");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("N5");
    expect(fetch).toHaveBeenCalledWith("/api/dashboard/levels/n5", { credentials: "same-origin" });
  });

  it("says a level does not exist, and offers the way back to Today", async () => {
    answer(404, { message: "unknown JLPT Level" });
    open("/level/n9");
    expect((await screen.findByRole("alert")).textContent).toBe("There is no level N9. The levels run from N5 to N1.");
    expect(screen.getByRole("link", { name: "Back to Today" }).getAttribute("href")).toBe("/");
  });

  it("asks a logged-out visitor to log in", async () => {
    answer(401, { message: "log in first" });
    open("/level/n4");
    expect((await screen.findByRole("alert")).textContent).toBe("Log in to see N4.");
  });

  it("says so when the API fails or the request never arrives", async () => {
    answer(500, {});
    open("/level/n4");
    expect((await screen.findByRole("alert")).textContent).toBe("N4 didn't load. Try again in a moment.");
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    open("/level/n4");
    expect((await screen.findByRole("alert")).textContent).toBe("N4 didn't load. Try again in a moment.");
  });
});
