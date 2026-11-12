// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlacementScreen } from "../web/PlacementScreen.tsx";

const asked = () => vi.mocked(fetch).mock.calls.map(([url]) => url);

const open = (address: string) => {
  history.replaceState(null, "", address);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify({ level: url.split("/").pop(), items: [] }))));
  render(<PlacementScreen />);
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("the Placement screen", () => {
  it("opens at N5 and loads the level a button picks", async () => {
    open("/placement");
    fireEvent.click(await screen.findByRole("button", { name: "N3" }));
    await screen.findByRole("button", { name: "N3", pressed: true });
    expect(asked()).toEqual(["/api/placement/N5", "/api/placement/N3"]);
  });

  it("opens at the level the Level filter names, without level buttons of its own", async () => {
    open("/placement?level=n2");
    await screen.findByText(/Tick what you already know/);
    expect(asked()).toEqual(["/api/placement/N2"]);
    expect(screen.queryByRole("group", { name: "JLPT Level" })).toBeNull();
  });
});

describe("the Placement screen talking to its API", () => {
  const DAY = "00000058-0000-7000-8000-000000000001";
  const list = { level: "N5", items: [{ id: DAY, type: "kanji", label: "日", reading: "ニチ", meaning: "day", known: false }] };

  /** Answers a GET with `load` and a POST with `save`: each a status and a JSON body. */
  const serve = (load: [number, unknown], save: [number, unknown] = [200, { recorded: 1 }]) => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const [status, body] = init?.method === "POST" ? save : load;
      return new Response(JSON.stringify(body), { status });
    });
    vi.stubGlobal("fetch", fetch);
    render(<PlacementScreen />);
    return fetch;
  };

  const tickAndMark = async () => {
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Mark 1 as Known" }));
  };

  it("asks a logged-out Learner to log in", async () => {
    serve([401, {}]);
    expect((await screen.findByRole("status")).textContent).toBe("Log in to use Placement.");
  });

  it("says when a level could not load for any other reason", async () => {
    serve([500, {}]);
    expect((await screen.findByRole("status")).textContent).toBe("Placement could not load this level.");
  });

  it("unticks an item that is ticked twice", async () => {
    serve([200, list]);
    const box = (await screen.findByRole("checkbox")) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect(screen.getByRole("button", { name: "Mark 0 as Known" })).toBeTruthy();
  });

  it("sends the ticked Study Items, says how many became Known, and loads the level again with nothing ticked", async () => {
    const fetch = serve([200, list]);
    await tickAndMark();
    expect((await screen.findByRole("status")).textContent).toBe("1 marked as Known.");
    await screen.findByRole("button", { name: "Mark 0 as Known" });

    const [url, init] = fetch.mock.calls[1]!;
    expect(url).toBe("/api/placement/N5");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse(init!.body as string)).toEqual({ studyItemIds: [DAY] });
    expect(fetch.mock.calls.map(([asked]) => asked)).toEqual(["/api/placement/N5", "/api/placement/N5", "/api/placement/N5"]);
  });

  it("keeps the ticks and says so when they could not be saved", async () => {
    const fetch = serve([200, list], [500, {}]);
    await tickAndMark();
    expect((await screen.findByRole("status")).textContent).toBe("Placement could not save your ticks.");
    expect(screen.getByRole("button", { name: "Mark 1 as Known" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("drops the ticks and the message when the level changes", async () => {
    serve([200, list], [500, {}]);
    await tickAndMark();
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "N4" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Loading N4…")).toBeTruthy();
    await screen.findByRole("button", { name: "Mark 0 as Known" });
  });
});
