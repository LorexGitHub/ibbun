// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchTextScreen, EpisodesScreen, PassageScreen } from "../web/screens.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WORD = "00000000-0000-7000-8000-00000000000a";
const view = {
  title: "朝ごはん",
  episode: null,
  credits: [],
  sentences: [{ id: "00000000-0000-7000-8000-000000000002", translation: null, runs: [{ text: "食べる", reading: null, wordId: WORD, inBatch: false }] }],
};

const stub = (routes: Record<string, { status?: number; body: unknown }>) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = routes[url] ?? { status: 404, body: {} };
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body };
  });
  return calls;
};

const at = (path: string, route: string, element: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>,
  );

describe("reading screens", () => {
  it("loads the episode lists", async () => {
    stub({ "/api/reading/episodes": { body: { levels: [] } } });
    at("/reading", "/reading", <EpisodesScreen />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    await waitFor(() => expect(screen.getByText(/No stories yet/)).toBeTruthy());
  });

  it("loads one level's episodes when the Level filter names a level", async () => {
    history.replaceState(null, "", "/reading?level=n4");
    const calls = stub({ "/api/reading/episodes?level=N4": { body: { levels: [] } } });
    at("/reading", "/reading", <EpisodesScreen />);
    await waitFor(() => expect(screen.getByText(/No stories yet/)).toBeTruthy());
    expect(calls.map((c) => c.url)).toEqual(["/api/reading/episodes?level=N4"]);
    history.replaceState(null, "", "/");
  });

  it("says so when the episodes cannot load", async () => {
    stub({});
    at("/reading", "/reading", <EpisodesScreen />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Reading could not load this."));
  });

  it("opens a Batch Text and logs a lookup when a Word is tapped", async () => {
    const calls = stub({
      "/api/reading/batch-texts/t1": { body: view },
      "/api/reading/lookups": { body: { label: "食べる", reading: "たべる", meanings: ["to eat"] } },
    });
    at("/reading/texts/t1", "/reading/texts/:id", <BatchTextScreen />);
    fireEvent.click(await screen.findByRole("button", { name: /食べる/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("to eat"));
    const lookup = calls.find((c) => c.url === "/api/reading/lookups");
    expect(lookup?.init?.method).toBe("POST");
    expect(JSON.parse(lookup?.init?.body as string)).toEqual({ wordId: WORD });
  });

  it("opens a Reading Passage", async () => {
    stub({ "/api/reading/passages/p1": { body: view } });
    at("/reading/passages/p1", "/reading/passages/:id", <PassageScreen />);
    expect(await screen.findByRole("heading", { name: "朝ごはん" })).toBeTruthy();
  });
});
