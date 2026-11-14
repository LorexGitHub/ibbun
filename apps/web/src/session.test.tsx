// @vitest-environment happy-dom
import type { Slice } from "@ibbun/slice";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import { buildShell, discoverSlices } from "./slices.ts";
import { client, useWho } from "./who.ts";

// happy-dom's Web Animations reject when the dock's animations are cancelled on unmount; motion falls back to its own timer without them
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, "animate");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const learner = { learnerId: "l", email: "learner@x.test", role: "learner" as const };
const modules = import.meta.glob<{ default: Slice }>("../../../scripts/fixtures/root/slices/*/register.ts", { eager: true });

/** A promise the test settles by hand, to put two answers in a chosen order. */
const deferred = <T,>() => {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (settle = resolve));
  return { promise, settle };
};

describe("useWho", () => {
  it("knows a logged-in Learner, a visitor, and a failed check as a visitor", async () => {
    const session = vi.spyOn(client, "session");
    session.mockResolvedValueOnce({ ok: true, data: learner });
    const { result, rerender } = renderHook(({ path }) => useWho(path)[0], { initialProps: { path: "/" } });
    expect(result.current).toEqual({ state: "loading" });
    await waitFor(() => expect(result.current).toEqual({ state: "in", learner }));

    session.mockResolvedValueOnce({ ok: true, data: null });
    rerender({ path: "/login" });
    await waitFor(() => expect(result.current).toEqual({ state: "out" }));

    session.mockRejectedValueOnce(new Error("offline"));
    rerender({ path: "/signup" });
    session.mockResolvedValueOnce({ ok: false, status: 500, message: "down" });
    rerender({ path: "/settings" });
    await waitFor(() => expect(session).toHaveBeenCalledTimes(4));
    expect(result.current).toEqual({ state: "out" });
  });

  it("ignores an answer that arrives after the Learner has moved on", async () => {
    const slow = deferred<Awaited<ReturnType<typeof client.session>>>();
    const fast = deferred<Awaited<ReturnType<typeof client.session>>>();
    vi.spyOn(client, "session").mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { result, rerender } = renderHook(({ path }) => useWho(path)[0], { initialProps: { path: "/" } });
    rerender({ path: "/login" });
    await act(async () => fast.settle({ ok: true, data: null }));
    await act(async () => slow.settle({ ok: true, data: learner }));
    expect(result.current).toEqual({ state: "out" });
  });
});

describe("logging out from the account menu", () => {
  let loggedIn = true;
  const logOut = async () => {
    loggedIn = true;
    vi.spyOn(client, "session").mockImplementation(async () => ({ ok: true, data: loggedIn ? learner : null }));
    const shell = await buildShell(discoverSlices(modules));
    render(
      <MemoryRouter initialEntries={["/sample"]}>
        <App shell={shell} />
      </MemoryRouter>,
    );
    fireEvent.keyDown(await screen.findByRole("button", { name: /Account/ }), { key: "Enter" });
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Log out" })));
  };

  it("logs the Learner out and shows the welcome", async () => {
    vi.spyOn(client, "signOut").mockImplementation(async () => {
      loggedIn = false;
      return { ok: true, data: null };
    });
    const error = vi.spyOn(toast, "error");
    await logOut();
    expect((await screen.findByRole("link", { name: /Sign up/ })).getAttribute("href")).toBe("/signup");
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps the Learner logged in and says why when logging out fails", async () => {
    vi.spyOn(client, "signOut").mockResolvedValue({ ok: false, status: 500, message: "server down" });
    const error = vi.spyOn(toast, "error");
    await logOut();
    expect(error).toHaveBeenCalledWith("You're still logged in.", { description: "server down" });
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });
});

describe("a door opened for one level", () => {
  const drill: Slice = { name: "drill", nav: { label: "Drill", path: "/drill", place: "study", blurb: "Drill.", glyph: "練", session: true } };
  const book: Slice = { name: "book", nav: { label: "Book", path: "/book", place: "library", blurb: "Book." } };
  const who = { state: "in" as const, learner };
  const open = async (address: string, as: Parameters<typeof App>[0]["initialWho"] = who) => {
    history.replaceState(null, "", address);
    const shell = await buildShell(discoverSlices({ ...modules, drill: { default: drill }, book: { default: book } }));
    render(
      <MemoryRouter initialEntries={[address]}>
        <App shell={shell} initialWho={as} />
      </MemoryRouter>,
    );
  };
  const filter = () => screen.queryByRole("navigation", { name: "Level filter" });
  afterEach(() => history.replaceState(null, "", "/"));

  it("keeps All and the levels in the header of a filtered screen, in place of the links to the level pages", async () => {
    await open("/sample?level=n3");
    expect(filter()).toBeTruthy();
    expect(screen.getByRole("link", { name: "N3" }).getAttribute("aria-current")).toBe("true");
    expect(screen.queryByRole("navigation", { name: "Levels" })).toBeNull();
  });

  it("keeps them beside the name of a filtered session, and gives the level pages back when All is chosen", async () => {
    await open("/drill?level=n3");
    expect(filter()).toBeTruthy();
    expect(screen.getByText("Drill")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "All" }));
    expect(filter()).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("shows no filter without a level, on a screen that takes none, or to a visitor", async () => {
    await open("/sample");
    expect(filter()).toBeNull();
    expect(screen.getByRole("navigation", { name: "Levels" })).toBeTruthy();
    cleanup();
    await open("/book?level=n3");
    expect(filter()).toBeNull();
    cleanup();
    await open("/sample?level=n3", { state: "out" });
    expect(filter()).toBeNull();
  });
});

describe("Esc on a session screen", () => {
  const drill: Slice = { name: "drill", nav: { label: "Drill", path: "/drill", place: "study", blurb: "Drill.", glyph: "練", session: true } };
  const Where = () => <output aria-label="where">{useLocation().pathname}</output>;
  const open = async (address: string) => {
    const shell = await buildShell(discoverSlices({ ...modules, drill: { default: drill } }));
    render(
      <MemoryRouter initialEntries={[address]}>
        <App shell={shell} initialWho={{ state: "in", learner }} />
        <Where />
      </MemoryRouter>,
    );
  };
  const where = () => screen.getByLabelText("where").textContent;

  it("is Done for now: it shows on the link and leaves for Today", async () => {
    await open("/drill");
    const done = screen.getByRole("link", { name: "Done for now" });
    expect(done.querySelector("kbd")?.textContent).toBe("Esc");
    expect(done.getAttribute("aria-keyshortcuts")).toBe("Escape");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(where()).toBe("/");
  });

  it("goes nowhere from a screen that is no session", async () => {
    await open("/sample");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(where()).toBe("/sample");
  });
});

describe("a visitor on a session screen", () => {
  const drill: Slice = { name: "drill", nav: { label: "Drill", path: "/drill", place: "study", blurb: "Drill.", glyph: "練", session: true } };
  const Where = () => {
    const { pathname, search } = useLocation();
    return <output aria-label="where">{pathname + search}</output>;
  };
  const open = async (address: string, who: "in" | "out") => {
    const shell = await buildShell(discoverSlices({ ...modules, drill: { default: drill } }));
    render(
      <MemoryRouter initialEntries={[address]}>
        <App shell={shell} initialWho={who === "in" ? { state: "in", learner } : { state: "out" }} />
        <Where />
      </MemoryRouter>,
    );
  };
  const where = () => screen.getByLabelText("where").textContent;

  it("goes to Log in, which returns to the session afterwards", async () => {
    await open("/drill?level=n3", "out");
    await waitFor(() => expect(where()).toBe(`/login?next=${encodeURIComponent("/drill?level=n3")}`));
  });

  it("stays put on a screen that is not a session, and a Learner stays on the session", async () => {
    await open("/sample", "out");
    expect(where()).toBe("/sample");
    cleanup();
    await open("/drill", "in");
    expect(where()).toBe("/drill");
  });
});
