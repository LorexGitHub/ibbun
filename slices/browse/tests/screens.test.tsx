// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyItemId } from "@mojibun/shared";
import type { ItemPage, Tile } from "../contract.ts";
import slice from "../register.ts";
import { BrowseView, type BrowseViewProps } from "../web/BrowseView.tsx";
import { BrowseScreen, ItemScreen } from "../web/screens.tsx";

/** Moves the address the way the header's level filter does. */
const visit = (address: string) => {
  window.history.pushState(null, "", address);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

afterEach(() => {
  cleanup();
  window.history.pushState(null, "", "/");
  vi.unstubAllGlobals();
});

const id = (n: number) => StudyItemId.parse(`00000058-0000-7000-8000-${n.toString().padStart(12, "0")}`);
const tile = (over: Partial<Tile> = {}): Tile => ({ id: id(1), type: "kanji", level: "N5", label: "日", reading: "ニチ", meaning: "day", mastery: "new", ...over });

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

const view = (over: Partial<BrowseViewProps> = {}) => {
  const on = { onLevel: vi.fn(), onTrack: vi.fn(), onQuery: vi.fn(), onOpen: vi.fn() };
  render(<BrowseView level="N5" track="kanji" query="" tiles={[tile()]} message={null} {...on} {...over} />);
  return on;
};

const wall = () => screen.getByRole("list", { name: /^N\d / });
const tilesShown = () => within(wall()).getAllByRole("button");
const selected = (tablist: string) =>
  within(screen.getByRole("tablist", { name: tablist }))
    .getAllByRole("tab")
    .filter((tab) => tab.getAttribute("aria-selected") === "true")
    .map((tab) => tab.textContent);

describe("the Mastery wall", () => {
  it("is headed Library, with the five levels and the three Tracks as tabs", () => {
    view({ level: "N4", track: "word" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Library");
    expect(within(screen.getByRole("tablist", { name: "JLPT Level" })).getAllByRole("tab").map((t) => t.textContent)).toEqual(["N5", "N4", "N3", "N2", "N1"]);
    expect(within(screen.getByRole("tablist", { name: "Track" })).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Kanji", "Words", "Grammar"]);
    expect(selected("JLPT Level")).toEqual(["N4"]);
    expect(selected("Track")).toEqual(["Words"]);
  });

  it("tells the screen which level and Track were picked", () => {
    const on = view();
    fireEvent.click(screen.getByRole("tab", { name: "N3" }));
    fireEvent.click(screen.getByRole("tab", { name: "Grammar" }));
    expect(on.onLevel).toHaveBeenCalledWith("N3");
    expect(on.onTrack).toHaveBeenCalledWith("grammar_point");
  });

  it("shows one tile for each Study Item of the Track, and none of the other Tracks", () => {
    view({ tiles: [tile(), tile({ id: id(3), label: "月", meaning: "moon" }), tile({ id: id(4), type: "word", label: "日本" })] });
    expect(wall().getAttribute("aria-label")).toBe("N5 Kanji");
    expect(wall().getAttribute("data-track")).toBe("kanji");
    expect(tilesShown().map((t) => t.textContent)).toEqual(["日", "月"]);
  });

  it("names a tile by its written form, meaning and Mastery, and shades it by Mastery", () => {
    view({ tiles: [tile({ mastery: "young" }), tile({ id: id(3), label: "月", meaning: null, mastery: "relearning" })] });
    const [day, moon] = tilesShown();
    expect(day!.getAttribute("aria-label")).toBe("日, day, Young");
    expect(day!.getAttribute("data-mastery")).toBe("young");
    expect(day!.getAttribute("lang")).toBe("ja");
    expect(moon!.getAttribute("aria-label")).toBe("月, Relearning");
    expect(moon!.getAttribute("data-mastery")).toBe("relearning");
  });

  it("opens the Study Item of the tile that is pressed", () => {
    const on = view({ tiles: [tile(), tile({ id: id(3), label: "月" })] });
    fireEvent.click(screen.getByRole("button", { name: /^月/ }));
    expect(on.onOpen).toHaveBeenCalledWith(id(3));
  });

  it("counts the wall and what has been started, lightest Mastery first", () => {
    view({ tiles: [tile({ mastery: "mature" }), tile({ id: id(3), mastery: "learning" }), tile({ id: id(4), mastery: "learning" }), tile({ id: id(5) }), tile({ id: id(6), type: "word", mastery: "young" })] });
    expect(screen.getByText("4 Kanji at N5. 2 Learning, 1 Mature.")).toBeTruthy();
  });

  it("says so when nothing on the wall has been started", () => {
    view({ track: "word", tiles: [tile({ type: "word" })] });
    expect(screen.getByText("1 Words at N5. None started yet.")).toBeTruthy();
  });

  it("lists the five Masteries in its legend, lightest first, each with its shade", () => {
    view();
    const legend = within(screen.getByRole("list", { name: "Mastery" })).getAllByRole("listitem");
    expect(legend.map((li) => li.textContent)).toEqual(["New", "Learning", "Relearning", "Young", "Mature"]);
    expect(legend.map((li) => li.firstElementChild!.getAttribute("data-mastery"))).toEqual(["new", "learning", "relearning", "young", "mature"]);
  });

  it("says when a level has nothing in a Track, with nothing to clear", () => {
    view({ level: "N1", track: "grammar_point", tiles: [tile()] });
    expect(screen.getByText("No Grammar at N1 yet. Pick another level or Track above.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear the search" })).toBeNull();
    expect(screen.queryByText(/None started/)).toBeNull();
  });

  it("says Loading until the level arrives, and shows a load message in its place", () => {
    view({ tiles: null });
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Mastery" })).toBeNull();
    cleanup();
    view({ tiles: null, message: "Log in to open the Library." });
    expect(screen.getByRole("status").textContent).toBe("Log in to open the Library.");
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});

describe("searching the wall", () => {
  const three = [tile(), tile({ id: id(3), label: "月", reading: "ゲツ", meaning: "Moon" }), tile({ id: id(4), label: "火", reading: null, meaning: null })];
  const dimmed = () => tilesShown().filter((t) => t.hasAttribute("data-dim")).map((t) => t.textContent);

  it("dims nothing while the field is empty or blank", () => {
    view({ tiles: three });
    expect(dimmed()).toEqual([]);
    expect(screen.queryByText(/match/)).toBeNull();
    cleanup();
    view({ tiles: three, query: "  " });
    expect(dimmed()).toEqual([]);
    expect(screen.queryByText(/match/)).toBeNull();
  });

  it.each([
    ["月", ["日", "火"]],
    ["ゲツ", ["日", "火"]],
    [" MOON ", ["日", "火"]],
    ["day", ["月", "火"]],
  ])("keeps what matches %s by written form, reading or meaning and dims the rest", (query, rest) => {
    view({ tiles: three, query });
    expect(dimmed()).toEqual(rest);
    expect(screen.getByText(/1 match\.$/)).toBeTruthy();
    expect(tilesShown()).toHaveLength(3);
  });

  it("hands on what is typed", () => {
    const on = view();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "moon" } });
    expect(on.onQuery).toHaveBeenCalledWith("moon");
  });

  it("names what was typed when nothing matches, and clears it with one button", () => {
    const on = view({ tiles: three, query: " zzz " });
    expect(screen.getByText(/Nothing on this wall matches "zzz"\./)).toBeTruthy();
    expect(dimmed()).toEqual(["日", "月", "火"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(on.onQuery).toHaveBeenCalledWith("");
  });
});

describe("BrowseScreen", () => {
  const n5 = [tile(), tile({ id: id(2), type: "word", label: "日本", meaning: "Japan", mastery: "learning" })];
  const answers = {
    "/api/browse/levels/N5": [200, { level: "N5", items: n5 }],
    "/api/browse/levels/N4": [200, { level: "N4", items: [tile({ id: id(5), label: "月", level: "N4" })] }],
    "/api/browse/levels/N3": [200, { level: "N3", items: [tile({ id: id(7), label: "政", level: "N3" })] }],
    [`/api/browse/items/${id(2)}`]: [200, page],
  } satisfies Record<string, [number, unknown]>;

  const browse = () =>
    render(
      <MemoryRouter>
        <BrowseScreen />
      </MemoryRouter>,
    );

  const openJapan = async () => {
    serve(answers);
    browse();
    fireEvent.click(await screen.findByRole("tab", { name: "Words" }));
    fireEvent.click(await screen.findByRole("button", { name: /^日本/ }));
    return screen.findByRole("dialog", { name: "Study Item" });
  };

  it("shows the N5 Kanji first, then another Track or level when it is picked", async () => {
    const fetch = serve(answers);
    browse();
    await screen.findByRole("button", { name: "日, day, New" });
    expect(fetch).toHaveBeenCalledWith("/api/browse/levels/N5");
    expect(selected("JLPT Level")).toEqual(["N5"]);
    expect(selected("Track")).toEqual(["Kanji"]);

    fireEvent.click(screen.getByRole("tab", { name: "Words" }));
    expect(tilesShown().map((t) => t.getAttribute("aria-label"))).toEqual(["日本, Japan, Learning"]);

    fireEvent.click(screen.getByRole("tab", { name: "Kanji" }));
    fireEvent.click(screen.getByRole("tab", { name: "N4" }));
    expect(screen.getByText("Loading…")).toBeTruthy();
    await screen.findByRole("button", { name: /^月/ });
    expect(screen.queryByRole("button", { name: /^日/ })).toBeNull();
  });

  it("starts at the level in the address, and follows the level filter when it moves", async () => {
    serve(answers);
    visit("/browse?level=n3");
    browse();
    await screen.findByRole("button", { name: /^政/ });
    expect(selected("JLPT Level")).toEqual(["N3"]);

    act(() => visit("/browse?level=n4"));
    await screen.findByRole("button", { name: /^月/ });
    expect(selected("JLPT Level")).toEqual(["N4"]);
  });

  it("dims what the Learner's search does not match without asking the server", async () => {
    const fetch = serve(answers);
    browse();
    const day = await screen.findByRole("button", { name: /^日/ });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "moon" } });
    expect(day.hasAttribute("data-dim")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(day.hasAttribute("data-dim")).toBe(false);
    expect((screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement).value).toBe("");
  });

  it("opens a tile's Study Item as a sheet over the wall, with Learn now and Cram this", async () => {
    const sheet = await openJapan();
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect((await within(sheet).findByRole("heading", { level: 1 })).textContent).toBe("日本");
    expect(within(sheet).getByRole("link", { name: "Learn now" }).getAttribute("href")).toBe(`/learn?now=${id(2)}`);
    expect(within(sheet).getByRole("link", { name: "Cram this" }).getAttribute("href")).toBe(`/cram?items=${id(2)}`);
    expect(within(sheet).queryByRole("link", { name: "Library" })).toBeNull();
    expect(document.activeElement).toBe(within(sheet).getByRole("button", { name: "Close" }));
    expect(wall()).toBeTruthy();
  });

  it("has no sheet until a tile is pressed", async () => {
    serve(answers);
    browse();
    await screen.findByRole("button", { name: /^日/ });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts the sheet away with Close", async () => {
    const sheet = await openJapan();
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts the sheet away with Esc, and with no other key", async () => {
    const sheet = await openJapan();
    fireEvent.keyDown(sheet, { key: "Enter" });
    expect(screen.queryByRole("dialog")).toBe(sheet);
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts the sheet away with a click beside it, and keeps it for a click inside", async () => {
    const sheet = await openJapan();
    fireEvent.click(await within(sheet).findByRole("heading", { level: 1 }));
    expect(screen.queryByRole("dialog")).toBe(sheet);
    fireEvent.click(sheet.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks a logged-out Learner to log in", async () => {
    serve({ "/api/browse/levels/N5": [401, {}] });
    browse();
    expect((await screen.findByRole("status")).textContent).toBe("Log in to open the Library.");
  });

  it("says the Library could not load for any other failure", async () => {
    serve({ "/api/browse/levels/N5": [500, {}] });
    browse();
    expect((await screen.findByRole("status")).textContent).toBe("The Library could not load this.");
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

  it("links back to the Library, as a page of its own does", async () => {
    serve({ [`/api/browse/items/${id(2)}`]: [200, page] });
    itemAt(id(2));
    expect((await screen.findByRole("link", { name: "Library" })).getAttribute("href")).toBe("/browse");
  });

  it("keeps the Study Item it was last asked for when an earlier answer arrives late", async () => {
    const late: ((answer: Response) => void)[] = [];
    const json = (body: unknown) => new Response(JSON.stringify(body));
    vi.stubGlobal("fetch", vi.fn((url: string) => (url.endsWith(id(9)) ? new Promise<Response>((answer) => late.push(answer)) : Promise.resolve(json(page)))));
    render(
      <MemoryRouter initialEntries={[`/browse/items/${id(9)}`]}>
        <Link to={`/browse/items/${id(2)}`}>next</Link>
        <Routes>
          <Route path="/browse/items/:id" element={<ItemScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "next" }));
    await screen.findByRole("heading", { level: 1 });
    await act(async () => {
      late[0]!(json({ ...page, id: id(9) }));
      await new Promise((settled) => setTimeout(settled, 20));
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("日本");
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
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Log in to open the Library."));
  });
});

describe("register", () => {
  it("adds a Browse entry to the nav and mounts the Browse routes", async () => {
    expect(slice.nav).toMatchObject({ label: "Library", path: "/browse", place: "library" });
    const web = await slice.web!();
    expect(web.routes?.map((r) => r.path)).toEqual(["/browse", "/browse/items/:id"]);
  });
});
