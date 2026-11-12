// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlacementScreen } from "../web/PlacementScreen.tsx";

const ID = (n: number) => `00000058-0000-7000-8000-${String(n).padStart(12, "0")}`;
const DAY = ID(1);
const MOON = ID(2);
const FIRE = ID(3);
const JAPAN = ID(4);
const list = {
  level: "N5",
  items: [
    { id: DAY, type: "kanji", label: "日", reading: "ニチ", meaning: "day", known: false },
    { id: MOON, type: "kanji", label: "月", reading: "ゲツ", meaning: "moon", known: false },
    { id: FIRE, type: "kanji", label: "火", reading: "カ", meaning: null, known: true },
    { id: JAPAN, type: "word", label: "日本", reading: "にほん", meaning: "Japan", known: false },
  ],
};

/** Answers a GET with `load` and a POST with `save`: each a status and a JSON body. */
const serve = (load: [number, unknown] = [200, list], save: [number, unknown] = [200, { recorded: 1 }]) => {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const [status, body] = init?.method === "POST" ? save : load;
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetch);
  render(<PlacementScreen />);
  return fetch;
};

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const press = (name: string | RegExp) => fireEvent.click(button(name));
const pressed = (name: string | RegExp) => button(name).getAttribute("aria-pressed");
const tile = async (label: string) => (await screen.findByText(label, { selector: ".placement-tile-label" })).closest("button")!;
const counted = () => screen.getByText(/to mark as Known/).textContent;
const sent = (fetch: ReturnType<typeof serve>) => JSON.parse(fetch.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("the Placement wall", () => {
  it("opens on the N5 Kanji, one tile each, with what is Known pressed and locked", async () => {
    const fetch = serve();
    const wall = within(await screen.findByRole("list", { name: "N5 Kanji" }));
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/placement/N5"]);
    expect([pressed("N5"), pressed("N4"), pressed("Kanji"), pressed("Words"), pressed("Grammar")]).toEqual(["true", "false", "true", "false", "false"]);
    expect([button("N5").className, button("Words").className]).toEqual(["pill pill--ink", "pill"]);
    expect(wall.getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed"), (b as HTMLButtonElement).disabled, b.dataset.known])).toEqual([
      ["日", "false", false, "false"],
      ["月", "false", false, "false"],
      ["火", "true", true, "true"],
    ]);
    expect(wall.getAllByRole("button").map((b) => b.getAttribute("title"))).toEqual(["day", "moon", null]);
    expect(counted()).toBe("0 to mark as Known · 1 of 4 Known");
    expect(button("Save").disabled).toBe(true);
  });

  it("shows Words and Grammar on wider tiles, with reading and meaning", async () => {
    serve();
    await tile("日");
    press("Words");
    const wall = screen.getByRole("list", { name: "N5 Words" });
    expect(wall.getAttribute("data-track")).toBe("word");
    expect((await tile("日本")).textContent).toBe("日本にほんJapan");
    expect(screen.queryByText("日", { selector: ".placement-tile-label" })).toBeNull();
    press("Grammar");
    expect(screen.getByText("No N5 Grammar yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^All of/ })).toBeNull();
  });

  it("leaves out a reading or meaning a Word does not have", async () => {
    serve([200, { level: "N5", items: [{ ...list.items[3], reading: null, meaning: null }] }]);
    press("Words");
    expect((await tile("日本")).textContent).toBe("日本");
  });

  it("presses a tile on a tap, counts it, and lets it go on a second tap", async () => {
    serve();
    const day = await tile("日");
    fireEvent.click(day);
    expect(day.getAttribute("aria-pressed")).toBe("true");
    expect(counted()).toBe("1 to mark as Known · 1 of 4 Known");
    expect(button("Save").disabled).toBe(false);
    fireEvent.click(day);
    expect(day.getAttribute("aria-pressed")).toBe("false");
    expect(counted()).toBe("0 to mark as Known · 1 of 4 Known");
  });

  it("keeps what is tapped while the Learner looks at another Track", async () => {
    serve();
    fireEvent.click(await tile("日"));
    press("Words");
    fireEvent.click(await tile("日本"));
    expect(counted()).toBe("2 to mark as Known · 1 of 4 Known");
    press("Kanji");
    expect((await tile("日")).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the whole level at once", () => {
  it("presses every tile of the Track that is not Known, and only that Track's", async () => {
    const fetch = serve();
    await tile("日");
    expect(pressed("All of N5 Kanji")).toBe("false");
    press("All of N5 Kanji");
    expect(pressed("All of N5 Kanji")).toBe("true");
    expect(counted()).toBe("2 to mark as Known · 1 of 4 Known");
    press("Save");
    await screen.findByRole("status");
    expect(sent(fetch)).toEqual({ studyItemIds: [DAY, MOON] });
  });

  it("finishes a Track that was partly tapped, and lets the whole Track go on a second press", async () => {
    serve();
    fireEvent.click(await tile("月"));
    expect(pressed("All of N5 Kanji")).toBe("false");
    press("All of N5 Kanji");
    expect(counted()).toMatch(/^2 /);
    press("Words");
    press("All of N5 Words");
    expect(counted()).toMatch(/^3 /);
    press("Kanji");
    press("All of N5 Kanji");
    expect(counted()).toMatch(/^1 /);
    expect(pressed("All of N5 Kanji")).toBe("false");
  });

  it("has nothing to offer once the whole Track is Known", async () => {
    serve([200, { level: "N5", items: [list.items[2]] }]);
    await tile("火");
    expect(button("All of N5 Kanji").disabled).toBe(true);
    expect(pressed("All of N5 Kanji")).toBe("false");
  });
});

describe("the Placement level", () => {
  const open = (address: string) => {
    history.replaceState(null, "", address);
    return serve([200, { level: "N5", items: [] }]);
  };

  it("loads the level a button picks", async () => {
    const fetch = open("/placement");
    fireEvent.click(await screen.findByRole("button", { name: "N3" }));
    await screen.findByRole("button", { name: "N3", pressed: true });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/placement/N5", "/api/placement/N3"]);
  });

  it("is the one the Level filter names, without level buttons of its own", async () => {
    const fetch = open("/placement?level=n2");
    await screen.findByText("No N2 Kanji yet.");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/placement/N2"]);
    expect(screen.queryByRole("group", { name: "JLPT Level" })).toBeNull();
    expect(screen.getByRole("group", { name: "Track" })).toBeTruthy();
  });

  it("drops what was tapped and the message when the level changes, and keeps the Track", async () => {
    serve([200, list], [500, {}]);
    press("Words");
    fireEvent.click(await tile("日本"));
    press("Save");
    await screen.findByRole("status");
    press("N4");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Loading N4…")).toBeTruthy();
    expect(screen.queryByText(/to mark as Known/)).toBeNull();
    await tile("日本");
    expect(counted()).toMatch(/^0 /);
    expect(pressed("Words")).toBe("true");
  });
});

describe("saving a Placement", () => {
  it("sends what was tapped, says how many became Known, and loads the level again with nothing tapped", async () => {
    const fetch = serve();
    fireEvent.click(await tile("日"));
    press("Save");
    expect((await screen.findByRole("status")).textContent).toBe("1 marked as Known.");
    expect(counted()).toMatch(/^0 /);

    const [url, init] = fetch.mock.calls[1]!;
    expect(url).toBe("/api/placement/N5");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(sent(fetch)).toEqual({ studyItemIds: [DAY] });
    expect(fetch.mock.calls.map(([asked]) => asked)).toEqual(["/api/placement/N5", "/api/placement/N5", "/api/placement/N5"]);
  });

  it("saves on Enter, and shows the key on the button", async () => {
    const fetch = serve();
    fireEvent.click(await tile("日"));
    expect(button("Save").querySelector("kbd")?.textContent).toBe("↵");
    fireEvent.keyDown(document.body, { key: "Enter" });
    await screen.findByRole("status");
    expect(sent(fetch)).toEqual({ studyItemIds: [DAY] });
  });

  it("does nothing on Enter while nothing is tapped", async () => {
    const fetch = serve();
    await tile("日");
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps what was tapped and says so when it could not be saved", async () => {
    const fetch = serve([200, list], [500, {}]);
    fireEvent.click(await tile("日"));
    press("Save");
    expect((await screen.findByRole("status")).textContent).toBe("Placement could not save your ticks.");
    expect(counted()).toMatch(/^1 /);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("asks a logged-out Learner to log in", async () => {
    serve([401, {}]);
    expect((await screen.findByRole("status")).textContent).toBe("Log in to use Placement.");
  });

  it("says when a level could not load for any other reason", async () => {
    serve([500, {}]);
    expect((await screen.findByRole("status")).textContent).toBe("Placement could not load this level.");
  });
});
