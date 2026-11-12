// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, KeyMark, keyRuns, useKey, type Press } from "./index.ts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const el = (html: string) => {
  document.body.innerHTML = html;
  return document.body.querySelector("[data-here]")!;
};
const press = (key: string, target: EventTarget | null = document.body, more: Partial<Press> = {}): Press => ({
  key,
  target,
  isComposing: false,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...more,
});

describe("keyRuns", () => {
  it("runs any key pressed on the page itself", () => {
    expect(keyRuns(press("1"))).toBe(true);
    expect(keyRuns(press("Enter"))).toBe(true);
    expect(keyRuns(press("Escape", null))).toBe(true);
  });

  it.each(["input", "textarea", "select", "div contenteditable"])("runs only Enter and Esc in a field (%s)", (tag) => {
    const field = el(`<${tag} data-here></${tag.split(" ")[0]}>`);
    expect(keyRuns(press("1", field))).toBe(false);
    expect(keyRuns(press("Enter", field))).toBe(true);
    expect(keyRuns(press("Escape", field))).toBe(true);
  });

  it.each(["button", "a", "summary"])("leaves Enter to a control that takes it, but not the other keys (%s)", (tag) => {
    const inside = el(`<${tag}><span data-here></span></${tag}>`);
    expect(keyRuns(press("Enter", inside))).toBe(false);
    expect(keyRuns(press("2", inside))).toBe(true);
    expect(keyRuns(press("Escape", inside))).toBe(true);
  });

  it("runs nothing while Japanese input is being composed, not even Enter and Esc", () => {
    expect(keyRuns(press("Enter", document.body, { isComposing: true }))).toBe(false);
    expect(keyRuns(press("Escape", document.body, { isComposing: true }))).toBe(false);
  });

  it.each(["repeat", "ctrlKey", "metaKey", "altKey"] as const)("runs nothing for a held key or a chord (%s)", (flag) => {
    expect(keyRuns(press("Enter", document.body, { [flag]: true }))).toBe(false);
  });

  it("runs nothing under an open dialog, which has keys of its own", () => {
    expect(keyRuns(press("Escape", el(`<div role="dialog"><p data-here></p></div>`)))).toBe(false);
  });
});

describe("useKey", () => {
  const Probe = ({ k, act }: { k?: string; act: () => void }) => (useKey(k, act), null);

  it("runs the newest act for its key and keeps the browser from acting on it too", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe k="Enter" act={first} />);
    rerender(<Probe k="Enter" act={second} />);

    expect(fireEvent.keyDown(document.body, { key: "Enter" })).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("leaves other keys, and keys that may not run, to the browser", () => {
    const act = vi.fn();
    render(<Probe k="1" act={act} />);
    render(<input aria-label="answer" />);

    expect(fireEvent.keyDown(document.body, { key: "2" })).toBe(true);
    expect(fireEvent.keyDown(screen.getByLabelText("answer"), { key: "1" })).toBe(true);
    expect(act).not.toHaveBeenCalled();
  });

  it("follows a change of key, and stops listening when it is gone", () => {
    const act = vi.fn();
    const { rerender, unmount } = render(<Probe k="1" act={act} />);
    rerender(<Probe k="2" act={act} />);
    fireEvent.keyDown(document.body, { key: "1" });
    expect(act).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "2" });
    expect(act).toHaveBeenCalledTimes(1);

    rerender(<Probe act={act} />);
    fireEvent.keyDown(document.body, { key: "2" });
    rerender(<Probe k="2" act={act} />);
    unmount();
    fireEvent.keyDown(document.body, { key: "2" });
    expect(act).toHaveBeenCalledTimes(1);
  });
});

describe("KeyMark", () => {
  it("shows Enter and Esc by their marks and any other key as itself, hidden from screen readers", () => {
    render(
      <>
        <KeyMark of="Enter" />
        <KeyMark of="Escape" />
        <KeyMark of="3" />
      </>,
    );
    const marks = [...document.querySelectorAll("kbd")];
    expect(marks.map((m) => m.textContent)).toEqual(["↵", "Esc", "3"]);
    expect(marks.every((m) => m.getAttribute("aria-hidden") === "true" && m.className === "key-mark")).toBe(true);
  });
});

describe("a Button with a key", () => {
  it("is pressed by its key, shows the mark, and keeps its name", () => {
    const onClick = vi.fn();
    render(
      <Button hotkey="Enter" onClick={onClick}>
        Next
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Next" });
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Enter");
    expect(button.querySelector("kbd")?.textContent).toBe("↵");

    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("submits its form when it is the submit button, once, from inside a field", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <input aria-label="answer" />
        <Button type="submit" hotkey="Enter">
          Check
        </Button>
      </form>,
    );
    fireEvent.keyDown(screen.getByLabelText("answer"), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does nothing while it is disabled", () => {
    const onClick = vi.fn();
    render(
      <Button hotkey="1" disabled onClick={onClick}>
        Pick
      </Button>,
    );
    fireEvent.keyDown(document.body, { key: "1" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("has no mark and no shortcut without a key", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Plain</Button>);
    const button = screen.getByRole("button", { name: "Plain" });
    expect(button.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.querySelector("kbd")).toBeNull();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onClick).not.toHaveBeenCalled();
  });
});
