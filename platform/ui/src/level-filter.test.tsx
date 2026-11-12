// @vitest-environment happy-dom
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LevelFilter, levelIn, levelQuery, useLevelFilter } from "./index.ts";

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

const at = (address: string) => history.replaceState(null, "", address);
const lit = () => screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "true").map((a) => a.textContent);

describe("levelIn", () => {
  it("reads the level of an address in either case", () => {
    expect(levelIn("?level=n3")).toBe("N3");
    expect(levelIn("?now=1&level=N1")).toBe("N1");
  });

  it("is undefined when the address names no level or one that does not exist", () => {
    expect(levelIn("")).toBeUndefined();
    expect(levelIn("?level=n6")).toBeUndefined();
    expect(levelIn("?level=")).toBeUndefined();
  });
});

describe("levelQuery", () => {
  it("is what a request for that level adds to its address, and nothing without a level", () => {
    expect(levelQuery("N3")).toBe("?level=N3");
    expect(levelQuery(undefined)).toBe("");
  });
});

describe("LevelFilter", () => {
  it("shows All and the five levels, easiest first, with the level of the address lit", () => {
    at("/reviews?level=n4");
    render(<LevelFilter />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["All", "N5", "N4", "N3", "N2", "N1"]);
    expect(lit()).toEqual(["N4"]);
    expect(screen.getByRole("navigation", { name: "Level filter" })).toBeTruthy();
  });

  it("lights All when the address names no level", () => {
    at("/reviews");
    render(<LevelFilter />);
    expect(lit()).toEqual(["All"]);
  });

  it("switches the level in place: same screen, new address, no page load", () => {
    at("/reviews?level=n4");
    render(<LevelFilter />);
    const n2 = screen.getByRole("link", { name: "N2" });
    expect(n2.getAttribute("href")).toBe("/reviews?level=n2");
    expect(fireEvent.click(n2)).toBe(false);
    expect(location.pathname + location.search).toBe("/reviews?level=n2");
    expect(lit()).toEqual(["N2"]);
  });

  it("removes the filter with All and keeps the rest of the address", () => {
    at("/learn?now=abc&level=n4");
    render(<LevelFilter />);
    expect(screen.getByRole("link", { name: "N1" }).getAttribute("href")).toBe("/learn?now=abc&level=n1");
    fireEvent.click(screen.getByRole("link", { name: "All" }));
    expect(location.pathname + location.search).toBe("/learn?now=abc");
    expect(lit()).toEqual(["All"]);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])("leaves a click with %o to the browser", (how) => {
    at("/reviews?level=n4");
    render(<LevelFilter />);
    expect(fireEvent.click(screen.getByRole("link", { name: "N2" }), how)).toBe(true);
  });
});

describe("useLevelFilter", () => {
  it("gives a screen the level of its address and follows the filter and the back button", () => {
    at("/reviews?level=n4");
    const { result } = renderHook(() => useLevelFilter());
    expect(result.current).toBe("N4");

    render(<LevelFilter />);
    fireEvent.click(screen.getByRole("link", { name: "N1" }));
    expect(result.current).toBe("N1");

    at("/reviews");
    fireEvent(window, new Event("popstate"));
    expect(result.current).toBeUndefined();
  });

  it("stops listening when the screen is gone", () => {
    at("/reviews?level=n4");
    const { result, unmount } = renderHook(() => useLevelFilter());
    unmount();
    at("/reviews");
    fireEvent(window, new Event("popstate"));
    expect(result.current).toBe("N4");
  });
});
