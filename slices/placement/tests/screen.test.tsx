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
