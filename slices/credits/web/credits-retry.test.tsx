// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreditsPage } from "./credits-page.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a failed load of the Credits page", () => {
  it("is an alert with Try again, which loads the credits again", async () => {
    const credits = [{ name: "JMdict", licenceName: "CC BY-SA 4.0", url: "https://www.edrdg.org/jmdict", version: "2026-11-02", appliedAt: null }];
    const get = vi.fn().mockResolvedValueOnce(new Response("down", { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ credits })));
    vi.stubGlobal("fetch", get);
    render(<CreditsPage />);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Not loaded")).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "JMdict" })).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
