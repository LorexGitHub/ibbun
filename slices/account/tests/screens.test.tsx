// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveSession, LearnerClient, Preferences, Result } from "@ibbun/learner/client";
import { ClientContext } from "../web/client.ts";
import { routes, widgets } from "../web/index.ts";
import { deviceName } from "../web/settings.tsx";

afterEach(cleanup);

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = (status: number, message: string): Result<never> => ({ ok: false, status, message });
const PREFS: Preferences = {
  furigana: "mixed",
  convertRomaji: true,
  explanations: "english",
  examMode: false,
  slowAudio: false,
  batchSize: 5,
};
const SESSIONS: ActiveSession[] = [
  { id: "mine", ipAddress: null, userAgent: "Firefox", createdAt: "c", lastUsedAt: "2026-11-05T10:00:00Z", current: true },
  { id: "other", ipAddress: null, userAgent: "Chrome", createdAt: "c", lastUsedAt: "2026-11-04T10:00:00Z", current: false },
];

/** A client that succeeds at everything. Each test replaces what it cares about. */
const fakeClient = (overrides: Partial<Record<keyof LearnerClient, unknown>> = {}) =>
  ({
    signUp: vi.fn(async () => ok(null)),
    resendVerification: vi.fn(async () => ok(null)),
    signIn: vi.fn(async () => ok(null)),
    signOut: vi.fn(async () => ok(null)),
    signOutEverywhere: vi.fn(async () => ok(null)),
    requestPasswordReset: vi.fn(async () => ok(null)),
    resetPassword: vi.fn(async () => ok(null)),
    changePassword: vi.fn(async () => ok(null)),
    changeEmail: vi.fn(async () => ok(null)),
    deleteAccount: vi.fn(async () => ok(null)),
    endSession: vi.fn(async () => ok(null)),
    session: vi.fn(async () => ok({ learnerId: "l1", email: "a@x.test", role: "learner" })),
    listSessions: vi.fn(async () => ok(SESSIONS)),
    preferences: vi.fn(async () => ok(PREFS)),
    changePreferences: vi.fn(async (change: object) => ok({ ...PREFS, ...change })),
    ...overrides,
  }) as unknown as LearnerClient & Record<string, ReturnType<typeof vi.fn>>;

const Where = () => <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;

const open = (path: string, client = fakeClient()) => {
  render(
    <ClientContext.Provider value={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {routes.map((r) => (
            <Route key={r.path} path={r.path} element={<r.component />} />
          ))}
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </ClientContext.Provider>,
  );
  return client;
};
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const where = () => screen.getByTestId("where").textContent;

describe("sign up", () => {
  it("says 'check your email' and offers a resend", async () => {
    const client = open("/signup");
    expect(screen.queryByRole("button", { name: "Send the link again" })).toBeNull();
    type("Email", "new@x.test");
    type("Password", "a long and unusual passphrase");
    press("Sign up");
    expect((await screen.findByRole("status")).textContent).toContain("Check your email");
    expect(client.signUp).toHaveBeenCalledWith("new@x.test", "a long and unusual passphrase");
    press("Send the link again");
    await waitFor(() => expect(client.resendVerification).toHaveBeenCalledWith("new@x.test"));
  });

  it("shows the server's message when sign-up is refused, with no resend", async () => {
    open("/signup", fakeClient({ signUp: vi.fn(async () => fail(400, "This password appears in a known data breach.")) }));
    type("Email", "a@x.test");
    type("Password", "password1234567");
    press("Sign up");
    expect((await screen.findByRole("alert")).textContent).toContain("data breach");
    expect(screen.queryByRole("button", { name: "Send the link again" })).toBeNull();
  });
});

describe("the split", () => {
  it("sets the line upright in Japanese beside the sign-up form, with Log in and one Review to try under it", () => {
    open("/signup");
    expect(screen.getByText("一文ずつ。").getAttribute("lang")).toBe("ja");
    expect(screen.getByRole("heading", { level: 1, name: "Sign up" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: "Try one Review first" }).getAttribute("href")).toBe("/try");
  });

  it("is the same for log in", () => {
    open("/login");
    expect(screen.getByText("一文ずつ。")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Log in" })).toBeTruthy();
  });

  it("is what the shell shows a visitor first", () => {
    expect(widgets.map((w) => w.slot)).toEqual(["welcome"]);
    const Welcome = widgets[0]!.component;
    render(
      <ClientContext.Provider value={fakeClient()}>
        <MemoryRouter>
          <Welcome />
        </MemoryRouter>
      </ClientContext.Provider>,
    );
    expect(screen.getByRole("button", { name: "Sign up" })).toBeTruthy();
  });
});

describe("one Review to try", () => {
  it("asks one question and marks a right answer, then leads back to sign-up", () => {
    open("/try");
    expect(screen.getByText("水を飲みます。").getAttribute("lang")).toBe("ja");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("link", { name: /Sign up/ })).toBeNull();
    type("What does 水 mean?", " Water ");
    press("Check");
    expect(screen.getByRole("status").textContent).toBe("Correct. 水 (みず) means water.");
    expect(screen.getByRole("link", { name: "Sign up to keep going" }).getAttribute("href")).toBe("/signup");
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });

  it("shows the answer after a wrong one and still leads back", () => {
    open("/try");
    type("What does 水 mean?", "fire");
    press("Check");
    expect(screen.getByRole("status").textContent).toBe("Not quite. 水 (みず) means water.");
    expect(screen.getByRole("link", { name: "Sign up to keep going" }).getAttribute("href")).toBe("/signup");
  });
});

describe("log in", () => {
  it("goes home after a good login", async () => {
    const client = open("/login");
    type("Email", "a@x.test");
    type("Password", "pw");
    press("Log in");
    await waitFor(() => expect(where()).toBe("/"));
    expect(client.signIn).toHaveBeenCalledWith("a@x.test", "pw");
  });

  it("stays on the form with the one failure message", async () => {
    open("/login", fakeClient({ signIn: vi.fn(async () => fail(401, "email or password is wrong")) }));
    type("Email", "a@x.test");
    type("Password", "bad");
    press("Log in");
    expect((await screen.findByRole("alert")).textContent).toBe("email or password is wrong");
    expect(where()).toBe("/login");
  });

  it("tells a Learner who just verified or reset to log in", () => {
    open("/login?verified=1");
    expect(screen.getByRole("status").textContent).toContain("Email verified");
    cleanup();
    open("/login?reset=1");
    expect(screen.getByRole("status").textContent).toContain("Password changed");
  });

  it("links to sign-up and to password reset", () => {
    open("/login");
    expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/signup");
    expect(screen.getByRole("link", { name: "Forgot your password?" }).getAttribute("href")).toBe("/forgot-password");
  });
});

describe("password reset", () => {
  it("always answers 'if that address has an account'", async () => {
    const client = open("/forgot-password");
    type("Email", "who@x.test");
    press("Send the link");
    expect((await screen.findByRole("status")).textContent).toBe("If that address has an account, we sent a link.");
    expect(client.requestPasswordReset).toHaveBeenCalledWith("who@x.test");
  });

  it("sets the new password with the token from the link and then asks for a login", async () => {
    const client = open("/reset-password?token=abc");
    type("New password", "another long passphrase");
    press("Change password");
    await waitFor(() => expect(where()).toBe("/login?reset=1"));
    expect(client.resetPassword).toHaveBeenCalledWith("abc", "another long passphrase");
  });

  it("shows no form for a link without a token", () => {
    open("/reset-password");
    expect(screen.getByRole("alert").textContent).toContain("not valid");
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.getByRole("link", { name: "Reset your password" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("keeps the form and shows the message when the link no longer works", async () => {
    open("/reset-password?token=old", fakeClient({ resetPassword: vi.fn(async () => fail(400, "invalid token")) }));
    type("New password", "another long passphrase");
    press("Change password");
    expect((await screen.findByRole("alert")).textContent).toBe("invalid token");
    expect(where()).toBe("/reset-password?token=old");
  });
});

describe("settings", () => {
  it("sends a visitor without a session to log in", async () => {
    open("/settings", fakeClient({ session: vi.fn(async () => ok(null)) }));
    await waitFor(() => expect(where()).toBe("/login"));
  });

  it("lays Look, Study and Account side by side with Devices in a pane of its own, and no Save button", async () => {
    open("/settings");
    await screen.findByLabelText("Off");
    const column = (name: string) => within(screen.getByRole("region", { name }));
    expect(column("Look").getByText(/Pick a look/)).toBeTruthy();
    expect(column("Study").getByLabelText("Show the English translation")).toBeTruthy();
    expect(column("Account").getByRole("button", { name: "Change email" })).toBeTruthy();
    expect(column("Account").getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(column("Account").getByRole("button", { name: "Delete my account" })).toBeTruthy();
    const devices = within(screen.getByRole("complementary", { name: "Devices" }));
    expect(await devices.findByText(/Firefox \(this device\)/)).toBeTruthy();
    expect(devices.getByRole("button", { name: "Log out everywhere" })).toBeTruthy();
    expect(devices.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("shows the email and changes it", async () => {
    const client = open("/settings");
    expect((await screen.findByText("a@x.test")).tagName).toBe("STRONG");
    type("New email", "new@x.test");
    press("Change email");
    await waitFor(() => expect(client.changeEmail).toHaveBeenCalledWith("new@x.test"));
    expect((await screen.findByText(/old one stays in use/)).getAttribute("role")).toBe("status");
  });

  it("changes the password and says the other sessions ended", async () => {
    const client = open("/settings");
    await screen.findByText("a@x.test");
    type("Current password", "old");
    type(/^New password$/, "a long and unusual passphrase");
    press("Change password");
    await waitFor(() => expect(client.changePassword).toHaveBeenCalledWith("old", "a long and unusual passphrase"));
    expect((await screen.findByText(/other sessions ended/)).getAttribute("role")).toBe("status");
  });

  it("lists sessions, ends another one and offers no end button for this device", async () => {
    const client = open("/settings");
    expect((await screen.findByText(/Firefox \(this device\)/)).textContent).toContain("2026-11-05");
    expect(screen.getAllByRole("button", { name: "End session" })).toHaveLength(1);
    press("End session");
    await waitFor(() => expect(client.endSession).toHaveBeenCalledWith("other"));
    expect(client.listSessions).toHaveBeenCalledTimes(2);
  });

  it("shows a session of an unknown device", async () => {
    open("/settings", fakeClient({ listSessions: vi.fn(async () => ok([{ ...SESSIONS[1], userAgent: null }])) }));
    expect(await screen.findByText(/Unknown device/)).toBeTruthy();
  });

  it("logs out here, or everywhere, and goes to log in", async () => {
    const client = open("/settings");
    await screen.findByText("a@x.test");
    press("Log out");
    await waitFor(() => expect(where()).toBe("/login"));
    expect(client.signOut).toHaveBeenCalled();
    cleanup();
    const again = open("/settings");
    await screen.findByText("a@x.test");
    press("Log out everywhere");
    await waitFor(() => expect(again.signOutEverywhere).toHaveBeenCalled());
    await waitFor(() => expect(where()).toBe("/login"));
  });

  it("stays on settings when logging out fails", async () => {
    open("/settings", fakeClient({ signOut: vi.fn(async () => fail(500, "down")) }));
    await screen.findByText("a@x.test");
    press("Log out");
    await new Promise((r) => setTimeout(r, 20));
    expect(where()).toBe("/settings");
  });

  it("deletes the account with the password and goes to sign-up", async () => {
    const client = open("/settings");
    await screen.findByText("a@x.test");
    type("Password to confirm", "pw");
    press("Delete my account");
    await waitFor(() => expect(where()).toBe("/signup"));
    expect(client.deleteAccount).toHaveBeenCalledWith("pw");
  });

  it("keeps the account and shows the message when the password is wrong", async () => {
    open("/settings", fakeClient({ deleteAccount: vi.fn(async () => fail(400, "invalid password")) }));
    await screen.findByText("a@x.test");
    type("Password to confirm", "bad");
    press("Delete my account");
    expect((await screen.findByText("invalid password")).getAttribute("role")).toBe("alert");
    expect(where()).toBe("/settings");
  });
});

describe("preferences", () => {
  it("shows no preferences until they load", async () => {
    open("/settings", fakeClient({ preferences: vi.fn(async () => fail(401, "log in first")) }));
    await screen.findByText("a@x.test");
    expect(screen.queryByRole("group", { name: /Preferences/ })).toBeNull();
  });

  it("saves each change at once and shows what the server kept", async () => {
    const client = open("/settings");
    await screen.findByLabelText("Only on Words still New to me");
    fireEvent.click(screen.getByLabelText("Off"));
    await waitFor(() => expect(client.changePreferences).toHaveBeenCalledWith({ furigana: "off" }));
    expect(((await screen.findByLabelText("Off")) as HTMLInputElement).checked).toBe(true);
    expect((await screen.findByText("Saved.")).getAttribute("role")).toBe("status");

    fireEvent.click(screen.getByLabelText("Turn romaji into kana as I type"));
    fireEvent.click(screen.getByLabelText("Listening in exam mode"));
    fireEvent.click(screen.getByLabelText("Play Listening audio slowly"));
    await waitFor(() => expect(client.changePreferences).toHaveBeenCalledTimes(4));
    expect(client.changePreferences).toHaveBeenCalledWith({ convertRomaji: false });
    expect(client.changePreferences).toHaveBeenCalledWith({ examMode: true });
    expect(client.changePreferences).toHaveBeenCalledWith({ slowAudio: true });
  });

  it("saves the batch size, ignores an emptied field, and offers no daily limit", async () => {
    const client = open("/settings");
    const batch = (await screen.findByLabelText("Study Items per Learn batch")) as HTMLInputElement;
    expect([batch.min, batch.max]).toEqual(["1", "20"]);
    expect(screen.queryByLabelText(/per day/)).toBeNull();
    type("Study Items per Learn batch", "8");
    await waitFor(() => expect(client.changePreferences).toHaveBeenCalledWith({ batchSize: 8 }));
    type("Study Items per Learn batch", "");
    expect(client.changePreferences).toHaveBeenCalledTimes(1);
  });

  it("never lets both explanations be off", async () => {
    const client = open("/settings");
    const english = (await screen.findByLabelText("Show the English translation")) as HTMLInputElement;
    const japanese = screen.getByLabelText("Show the Japanese Explanation") as HTMLInputElement;
    expect([english.checked, japanese.checked]).toEqual([true, false]);
    expect(english.disabled).toBe(true);

    fireEvent.click(japanese);
    await waitFor(() => expect(client.changePreferences).toHaveBeenCalledWith({ explanations: "both" }));
    await waitFor(() => expect(english.disabled).toBe(false));
    expect(japanese.disabled).toBe(false);

    fireEvent.click(english);
    await waitFor(() => expect(client.changePreferences).toHaveBeenCalledWith({ explanations: "japanese" }));
    await waitFor(() => expect(japanese.disabled).toBe(true));
  });

  it("does not save a change that would turn both off", async () => {
    const client = open("/settings");
    const english = (await screen.findByLabelText("Show the English translation")) as HTMLInputElement;
    fireEvent.click(english);
    await new Promise((r) => setTimeout(r, 20));
    expect(client.changePreferences).not.toHaveBeenCalled();
  });

  it("shows the server's message when a change is refused", async () => {
    open("/settings", fakeClient({ changePreferences: vi.fn(async () => fail(400, "those preferences are not valid")) }));
    fireEvent.click(await screen.findByLabelText("Off"));
    expect((await screen.findByText("those preferences are not valid")).getAttribute("role")).toBe("alert");
    expect((screen.getByLabelText("Only on Words still New to me") as HTMLInputElement).checked).toBe(true);
  });
});

describe("deviceName", () => {
  it("names the browser and system instead of printing the user-agent string", () => {
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
    expect(deviceName("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 Edg/130.0")).toBe("Edge on Android");
    expect(deviceName("curl/8.0")).toBe("Unknown device");
  });
});
