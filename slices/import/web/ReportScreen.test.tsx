// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunReport } from "../contract.ts";
import { ReportScreen, RunList } from "./ReportScreen.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const run = (over: Partial<RunReport> = {}): RunReport => ({
  id: "6b0d2c1e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  dataset: "jmdict",
  upstreamVersion: "3.6.2",
  status: "applied",
  appliedAt: "2026-11-02T12:00:00.000Z",
  counts: { added: 12, retired: 3, orphanedOverrides: 1 },
  diff: { added: 12, changed: 4, gone: 3 },
  queuePath: "/admin/content-approval?importRun=6b0d2c1e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  ...over,
});

describe("RunList", () => {
  it("shows a run's counts, its diff, and a link into the Content Approval queue filtered to the run", () => {
    render(<RunList runs={[run()]} />);
    expect(screen.getByRole("heading").textContent).toContain("jmdict 3.6.2");
    expect(screen.getByText("added").nextElementSibling?.textContent).toBe("12");
    expect(screen.getByText("overrides orphaned").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("overrides stale").nextElementSibling?.textContent).toBe("0");
    expect(screen.getByText(/12 keys added, 4 changed, 3 gone/)).toBeTruthy();
    expect(screen.getByText("Live since 2026-11-02")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Content Approval queue/ }).getAttribute("href")).toBe("/admin/content-approval?importRun=6b0d2c1e-3f4a-4b5c-8d6e-7f8091a2b3c4");
  });

  it("says plainly that the circuit breaker is holding a run that was not applied", () => {
    render(<RunList runs={[run({ status: "breaker tripped", appliedAt: null, diff: null })]} />);
    expect(screen.getByText("held by the circuit breaker")).toBeTruthy();
    expect(screen.getByText("Not applied")).toBeTruthy();
    expect(screen.queryByText(/keys added/)).toBeNull();
  });

  it("says there is no run yet", () => {
    render(<RunList runs={[]} />);
    expect(screen.getByText(/No Import Run yet/)).toBeTruthy();
  });
});

describe("ReportScreen", () => {
  it("loads the runs from the API", async () => {
    vi.stubGlobal("fetch", async (url: string) => (url === "/api/import/runs" ? Response.json({ runs: [run()] }) : new Response("", { status: 404 })));
    render(<ReportScreen />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("jmdict 3.6.2"));
  });

  it("tells a visitor without a session to log in, and a Learner that it is for the supervisor", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
    render(<ReportScreen />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Log in as the supervisor to see Import Runs."));
    cleanup();
    vi.stubGlobal("fetch", async () => new Response("", { status: 403 }));
    render(<ReportScreen />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Import Runs are for the supervisor."));
  });
});
