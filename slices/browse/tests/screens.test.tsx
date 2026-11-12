// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyItemId } from "@mojibun/shared";
import type { ItemPage, Summary } from "../contract.ts";
import slice from "../register.ts";
import { BrowseView } from "../web/BrowseView.tsx";
import { BrowseScreen, ItemScreen } from "../web/screens.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const id = (n: number) => StudyItemId.parse(`00000058-0000-7000-8000-${n.toString().padStart(12, "0")}`);
const summary = (over: Partial<Summary> = {}): Summary => ({ id: id(1), type: "kanji", level: "N5", label: "日", reading: "ニチ", meaning: "day", ...over });

const page: ItemPage = {
  id: id(2),
  level: "N5",
  locked: true,
  introduced: false,
  detail: { type: "word", forms: ["日本"], readings: [{ text: "にほん", pitchAccent: null }], senses: [{ partsOfSpeech: ["n"], glosses: ["Japan"], japaneseExplanation: null }] },
  examples: [],
  related: [],
  credits: [],
};

/** Routes each request to `answers[url]`: a status and a JSON body. */
const serve = (answers: Record<string, [number, unknown]>) => {
  const fetch = vi.fn(async (url: string) => {
    const [status, body] = answers[url] ?? [404, {}];
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

const itemAt = (itemId: string) =>
  render(
    <MemoryRouter initialEntries={[`/browse/items/${itemId}`]}>
      <Routes>
        <Route path="/browse/items/:id" element={<ItemScreen />} />
      </Routes>
    </MemoryRouter>,
  );

describe("a search with no result", () => {
  it("names what was searched and clears the search with one button", () => {
    const onQuery = vi.fn();
    render(
      <MemoryRouter>
        <BrowseView query=" zzz " level="N5" items={[]} message={null} onQuery={onQuery} onLevel={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Nothing matches "zzz".')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(onQuery).toHaveBeenCalledWith("");
  });

  it("has nothing to clear for a level that is empty", () => {
    render(
      <MemoryRouter>
        <BrowseView query="" level="N1" items={[]} message={null} onQuery={() => {}} onLevel={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Nothing at N1 yet. Pick another level above.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear the search" })).toBeNull();
  });
});

describe("BrowseScreen", () => {
  const browse = () =>
    render(
      <MemoryRouter>
        <BrowseScreen />
      </MemoryRouter>,
    );

  it("lists N5 first, then another level when it is picked", async () => {
    const fetch = serve({
      "/api/browse/levels/N5": [200, { level: "N5", items: [summary()] }],
      "/api/browse/levels/N4": [200, { level: "N4", items: [summary({ id: id(5), label: "月", level: "N4" })] }],
    });
    browse();
    await screen.findByText("日");
    expect(fetch).toHaveBeenCalledWith("/api/browse/levels/N5");

    fireEvent.click(screen.getByRole("button", { name: "N4" }));
    await screen.findByText("月");
    expect(screen.queryByText("日")).toBeNull();
  });

  it("searches once the Learner types, and returns to the level list when the box is cleared", async () => {
    const fetch = serve({
      "/api/browse/levels/N5": [200, { level: "N5", items: [summary()] }],
      "/api/browse/search?q=moon": [200, { query: "moon", items: [summary({ id: id(6), label: "月", meaning: "moon" })] }],
    });
    browse();
    await screen.findByText("日");

    const box = screen.getByRole("searchbox", { name: "Search" });
    fireEvent.change(box, { target: { value: "moon" } });
    await screen.findByText("moon");
    expect(fetch).toHaveBeenCalledWith("/api/browse/search?q=moon");

    fireEvent.change(box, { target: { value: "" } });
    await screen.findByText("日");
  });

  it("asks a logged-out Learner to log in", async () => {
    serve({ "/api/browse/levels/N5": [401, {}] });
    browse();
    expect((await screen.findByRole("status")).textContent).toBe("Log in to browse.");
  });

  it("says Browse could not load for any other failure", async () => {
    serve({ "/api/browse/levels/N5": [500, {}] });
    browse();
    expect((await screen.findByRole("status")).textContent).toBe("Browse could not load this.");
  });
});

describe("ItemScreen", () => {
  it("shows the page with its Locked badge", async () => {
    serve({ [`/api/browse/items/${id(2)}`]: [200, page] });
    itemAt(id(2));
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("日本");
    expect(screen.getByText("Locked")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Learn now" }).getAttribute("href")).toBe(`/learn?now=${id(2)}`);
  });

  it("follows a Retired Word to its successor", async () => {
    const fetch = serve({
      [`/api/browse/items/${id(9)}`]: [200, { redirectTo: id(2) }],
      [`/api/browse/items/${id(2)}`]: [200, page],
    });
    itemAt(id(9));
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("日本");
    expect(fetch).toHaveBeenCalledWith(`/api/browse/items/${id(2)}`);
  });

  it("says when there is no such Study Item", async () => {
    serve({});
    itemAt(id(3));
    expect((await screen.findByRole("status")).textContent).toBe("There is no such Study Item.");
  });

  it("asks a logged-out Learner to log in", async () => {
    serve({ [`/api/browse/items/${id(3)}`]: [401, {}] });
    itemAt(id(3));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Log in to browse."));
  });
});

describe("register", () => {
  it("adds a Browse entry to the nav and mounts the Browse routes", async () => {
    expect(slice.nav).toMatchObject({ label: "Library", path: "/browse", place: "library" });
    const web = await slice.web!();
    expect(web.routes?.map((r) => r.path)).toEqual(["/browse", "/browse/items/:id"]);
  });
});
