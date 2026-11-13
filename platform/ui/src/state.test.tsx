// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { State } from "./index.ts";

afterEach(cleanup);

describe("State", () => {
  it("shows a result as its mark, label, heading, fact, note and actions, the mark hidden from a screen reader", () => {
    const { container } = render(
      <State score={{ right: 7, of: 9 }} label="Practice over" title="Done" fact="7 of 9 right." note="No Example yet for 七.">
        <button type="button">Choose more</button>
      </State>,
    );
    const mark = container.querySelector(".state-mark")!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.textContent).toBe("7 / 9");
    expect(screen.getByRole("heading", { level: 2, name: "Done" })).toBeTruthy();
    expect(screen.getByText("Practice over")).toBeTruthy();
    expect(screen.getByText("7 of 9 right.")).toBeTruthy();
    expect(screen.getByText("No Example yet for 七.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose more" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("titles a whole screen at level 1 and a part of one at level 3 when asked", () => {
    render(
      <>
        <State title="Done" heading={1} />
        <State title="Nothing here yet" heading={3} inline />
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Done" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Nothing here yet" })).toBeTruthy();
  });

  it("draws an inline state without its mark", () => {
    const { container } = render(<State mark="読" title="Nothing here yet" inline />);
    expect(container.querySelector(".state-mark")).toBeNull();
    expect(container.querySelector(".state--inline")).toBeTruthy();
  });

  it("reads a failed load as an alert that offers Try again", () => {
    const retry = vi.fn();
    render(<State title="Your stories did not load" onRetry={retry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Your stories did not load");
    expect(alert.textContent).toContain("Not loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
