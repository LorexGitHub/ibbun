// @vitest-environment happy-dom
import type { NavEntry } from "@mojibun/slice";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu.tsx";
import { CommandMenu, useCommandKey } from "./CommandMenu.tsx";
import type { Who } from "./places.ts";

afterEach(cleanup);

const nav: NavEntry[] = [
  { label: "Reviews", path: "/reviews", place: "study", blurb: "Answer what's due.", glyph: "復" },
  { label: "Library", path: "/browse", place: "library", blurb: "Look up any kanji." },
  { label: "Settings", path: "/settings", place: "account", blurb: "Email and password." },
  { label: "Approval", path: "/admin/content-approval", place: "supervisor", blurb: "Check drafts." },
];

const as = (role: "learner" | "supervisor"): Who => ({ state: "in", learner: { learnerId: "x", email: `${role}@x.test`, role } });

const openAccountMenu = (who: Who, entries: NavEntry[], onSignOut = () => {}) => {
  render(
    <MemoryRouter>
      <AccountMenu who={who} nav={entries} onSignOut={onSignOut} />
    </MemoryRouter>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: /Account/ }), { key: "Enter" });
  return screen.getByRole("menu");
};

describe("the account menu", () => {
  it("offers a visitor a way to log in", () => {
    render(
      <MemoryRouter>
        <AccountMenu who={{ state: "out" }} nav={nav} onSignOut={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
  });

  it("lists the account screens and logs out, under the Learner's email", () => {
    const signOut = vi.fn();
    const menu = openAccountMenu(as("learner"), nav.slice(0, 3), signOut);
    expect(menu.textContent).toContain("learner@x.test");
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByText("Supervisor")).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("adds the Supervisor screens under their own heading", () => {
    openAccountMenu(as("supervisor"), nav);
    expect(screen.getByText("Supervisor")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Approval" })).toBeTruthy();
  });
});

const Keyed = ({ onOpen }: { onOpen: () => void }) => {
  useCommandKey(onOpen);
  return <input aria-label="answer" />;
};

describe("the command menu", () => {
  it("opens on Ctrl K anywhere and on / unless the Learner is typing", () => {
    const open = vi.fn();
    render(<Keyed onOpen={open} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyDown(window, { key: "/" });
    fireEvent.keyDown(screen.getByLabelText("answer"), { key: "/" });
    fireEvent.keyDown(window, { key: "k" });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("groups every place, offers Log out to a Learner, and closes when one is picked", async () => {
    const close = vi.fn();
    render(
      <MemoryRouter>
        <CommandMenu open onOpenChange={close} nav={nav} who={as("learner")} onSignOut={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog", { name: "Go to" })).toBeTruthy();
    expect(screen.getByText("Study")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Log out/ })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("option", { name: /Library/ })));
    expect(close).toHaveBeenCalledWith(false);
  });

  it("offers a visitor Log in and Sign up instead", () => {
    render(
      <MemoryRouter>
        <CommandMenu open onOpenChange={() => {}} nav={nav} who={{ state: "out" }} onSignOut={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("option", { name: "Log in" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Sign up" })).toBeTruthy();
  });
});
