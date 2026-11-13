// @vitest-environment happy-dom
import type { NavEntry } from "@ibbun/slice";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu.tsx";
import { AppDock } from "./AppDock.tsx";
import { CommandMenu, CommandTrigger, matchScore, useCommandKey } from "./CommandMenu.tsx";
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

const Address = () => {
  const { pathname, search } = useLocation();
  return <output data-testid="address">{pathname + search}</output>;
};

const openCommandMenu = (who: Who, onOpenChange = (_open: boolean) => {}) =>
  render(
    <MemoryRouter>
      <CommandMenu open onOpenChange={onOpenChange} nav={nav} who={who} onSignOut={() => {}} />
      <Address />
    </MemoryRouter>,
  );
const address = () => screen.getByTestId("address").textContent;
const checked = (name: string) => screen.getByRole("radio", { name }).getAttribute("aria-checked");
const pick = async (role: "radio" | "option", name: string | RegExp) => act(async () => fireEvent.click(screen.getByRole(role, { name })));

describe("the Where to? field", () => {
  it("opens the command menu and names its key", () => {
    const open = vi.fn();
    render(<CommandTrigger onOpen={open} />);
    const field = screen.getByRole("button", { name: /Where to\?/ });
    expect(field.textContent).toContain("Ctrl K");
    fireEvent.click(field);
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("the command menu's levels", () => {
  it("starts on All, with the five levels beside the doors", () => {
    openCommandMenu(as("learner"));
    const levels = screen.getByRole("radiogroup", { name: "Level" });
    expect(levels.textContent).toBe("All五N5四N4三N3二N2一N1");
    expect(checked("All")).toBe("true");
    expect(checked("N3")).toBe("false");
    expect(screen.queryByRole("option", { name: /level page/ })).toBeNull();
  });

  it("opens a door for the chosen level", async () => {
    openCommandMenu(as("learner"));
    await pick("radio", "N3");
    expect(checked("N3")).toBe("true");
    expect(checked("All")).toBe("false");
    expect(checked("N4")).toBe("false");
    await pick("option", /Reviews/);
    expect(address()).toBe("/reviews?level=n3");
  });

  it("links the chosen level to its page, and goes back to every level on All", async () => {
    openCommandMenu(as("learner"));
    await pick("radio", "N2");
    await pick("radio", "All");
    expect(checked("All")).toBe("true");
    expect(screen.queryByRole("option", { name: /level page/ })).toBeNull();
    await pick("radio", "N2");
    await pick("option", /N2 level page/);
    expect(address()).toBe("/level/n2");
  });

  it("forgets the level once the menu closes", async () => {
    const close = vi.fn();
    openCommandMenu(as("learner"), close);
    await pick("radio", "N1");
    await pick("option", /Library/);
    expect(close).toHaveBeenCalledWith(false);
    expect(address()).toBe("/browse");
    expect(checked("All")).toBe("true");
  });

  it("offers a visitor no levels, since a level page needs an account", () => {
    openCommandMenu({ state: "out" });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("option", { name: /Reviews/ })).toBeTruthy();
  });
});

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
    expect(screen.getByRole("dialog", { name: "Where to?" })).toBeTruthy();
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

describe("the command menu's matching", () => {
  it("ranks a name match over a description match, and never matches scattered letters", () => {
    expect(matchScore("Reading", "read", ["Short texts built from what you already know."])).toBe(1);
    expect(matchScore("Library", "kanji", ["Look up any kanji, word or grammar point."])).toBe(0.5);
    expect(matchScore("Today", "read", ["What's due, your streak and your way up."])).toBe(0);
    expect(matchScore("Placement", "read", ["Mark what you already know at a JLPT level."])).toBe(0);
    expect(matchScore("Today", "", [])).toBe(1);
  });
});

describe("the dock", () => {
  it("lists every place as a named glyph link and follows the pointer without breaking", () => {
    render(
      <MemoryRouter initialEntries={["/reviews"]}>
        <AppDock entries={nav.filter((e) => e.place !== "supervisor")} />
      </MemoryRouter>,
    );
    const dock = screen.getByRole("navigation", { name: "Main" });
    fireEvent.mouseMove(dock.firstElementChild!, { pageX: 40 });
    fireEvent.mouseLeave(dock.firstElementChild!);
    expect(screen.getByRole("link", { name: "Reviews" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Reviews" }).textContent).toContain("復");
    expect(screen.getByRole("link", { name: "Library" }).textContent).toContain("L");
  });
});
