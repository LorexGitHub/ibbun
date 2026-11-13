// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeScreen } from "../web/PracticeScreens.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ID = "00000000-0000-7000-8000-000000000001";
const entry = { id: ID, level: "N5", passageType: "email", length: "short", topic: null, at: "2026-03-01T10:00:00Z", title: null };

const stub = (options: unknown, result: unknown = { status: "waiting" }, texts: unknown[] = []) => {
  const posts: unknown[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") posts.push(JSON.parse(String(init.body)));
    const body = url.endsWith("/options") ? options : init?.method === "POST" ? result : { texts };
    return { ok: true, status: 200, json: async () => body };
  });
  return posts;
};

const open = () =>
  render(
    <MemoryRouter initialEntries={["/reading/practice"]}>
      <Routes>
        <Route path="/reading/practice" element={<PracticeScreen />} />
        <Route path="/reading/practice/:id" element={<p>opened text</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("Practice texts screen", () => {
  it("explains the unlock while no level is cleared, with no form", async () => {
    stub({ clearedLevels: [], remaining: 5 });
    open();
    await screen.findByText(/once you know every kanji/);
    expect(screen.queryByRole("button", { name: "Generate" })).toBeNull();
  });

  it("offers only the cleared levels and fixed lists, with no free-text field", async () => {
    stub({ clearedLevels: ["N5", "N4"], remaining: 3 });
    open();
    await screen.findByRole("button", { name: "Generate" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain("N4");
    expect(screen.queryByRole("option", { name: "N3" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("sends the choices and opens the text when it is ready", async () => {
    const posts = stub({ clearedLevels: ["N5"], remaining: 5 }, { status: "ready", id: ID });
    open();
    fireEvent.change(await screen.findByLabelText("Topic"), { target: { value: "旅行" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await screen.findByText("opened text");
    expect(posts).toEqual([{ level: "N5", passageType: "any", length: "short", topic: "旅行" }]);
  });

  it("sends the Learner to the library after the wait", async () => {
    stub({ clearedLevels: ["N5"], remaining: 5 }, { status: "waiting" }, [entry]);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await screen.findByText(/appear in your library/);
    expect(await screen.findByText(/Still being made/)).toBeTruthy();
  });

  it("says try again tomorrow at the limit", async () => {
    stub({ clearedLevels: ["N5"], remaining: 5 }, { status: "limit" });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await screen.findByText("Try again tomorrow.");
  });

  it("says try again tomorrow when none are left", async () => {
    stub({ clearedLevels: ["N5"], remaining: 0 });
    open();
    await screen.findByText(/Try again tomorrow/);
    expect(screen.queryByRole("button", { name: "Generate" })).toBeNull();
  });

  it("names an empty library under its own heading", async () => {
    stub({ clearedLevels: ["N5"], remaining: 5 });
    open();
    expect(await screen.findByRole("heading", { level: 3, name: "Nothing here yet" })).toBeTruthy();
    expect(screen.getByText("Texts you generate are kept here.")).toBeTruthy();
  });

  it("reads a failed load of the options as an error with Try again, apart from the library", async () => {
    let fail = true;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/options") && fail) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => (url.endsWith("/options") ? { clearedLevels: ["N5"], remaining: 5 } : { texts: [] }) };
    });
    open();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This did not load");
    expect(await screen.findByRole("heading", { name: "Nothing here yet" })).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Generate" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("links a ready text from the library", async () => {
    stub({ clearedLevels: ["N5"], remaining: 5 }, {}, [{ ...entry, title: "旅行のメモ" }]);
    open();
    const link = await screen.findByRole("link", { name: "旅行のメモ" });
    await waitFor(() => expect(link.getAttribute("href")).toBe(`/reading/practice/${ID}`));
  });
});
