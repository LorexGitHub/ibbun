import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import slice from "./register.ts";
import { loadQueue, QueueScreen, resolveEntry, routes, type QueueItem } from "./web.tsx";

const item = (over: Partial<QueueItem>): QueueItem => ({
  id: "1",
  reason: "escalated",
  lane: "reviewer",
  recordId: "rec-1",
  generationRunId: null,
  generationRequestId: null,
  detail: null,
  at: "2026-11-06T10:00:00Z",
  ...over,
});

const render = (items: QueueItem[], error?: string) =>
  renderToString(<QueueScreen items={items} reasons={["escalated", "generation failed"]} filter={{ reason: "", lane: "" }} onFilter={() => {}} onResolve={() => {}} error={error} />);

describe("queue screen", () => {
  it("shows each entry with its reason and lane, and a resolve button", () => {
    const html = render([item({}), item({ id: "2", reason: "generation failed", lane: "supervisor", detail: { attempts: 3 } })]);
    expect(html).toContain("escalated");
    expect(html).toContain("operational: goes straight to the supervisor");
    expect(html).toContain("the reviewer agent decides");
    expect(html).toContain("&quot;attempts&quot;: 3");
    expect(html.match(/Resolve/g)).toHaveLength(2);
    expect(html).not.toContain("Nothing is waiting.");
    expect(html).not.toContain("alert");
  });

  it("offers every reason as a filter", () => {
    expect(render([])).toContain("<option>generation failed</option>");
  });

  it("says when nothing waits, or why the queue could not load", () => {
    expect(render([])).toContain("Nothing is waiting.");
    expect(render([], "Supervisors only.")).toContain("Supervisors only.");
  });
});

describe("queue screen details", () => {
  it("marks operational entries as ink pills and leaves reviewer ones plain", () => {
    expect(render([item({ lane: "supervisor" })])).toContain('class="pill pill--ink"');
    expect(render([item({ lane: "reviewer" })])).not.toContain("pill--ink");
  });

  it("names the record and the Generation Request only when the entry has them", () => {
    const bare = render([item({ recordId: null, generationRequestId: null })]);
    expect(bare).not.toContain("Record");
    expect(bare).not.toContain("Generation Request");
    expect(bare).not.toContain("<pre>");
    const full = render([item({ recordId: "rec-9", generationRequestId: "req-9", detail: 0 })]);
    expect(full).toContain("rec-9");
    expect(full).toContain("req-9");
    expect(full).toContain("<pre>0</pre>");
  });

  it("does not claim the queue is empty when it could not load", () => {
    expect(render([], "Could not load the queue.")).not.toContain("Nothing is waiting.");
  });
});

describe("talking to the API", () => {
  const answering = (status: number, body: unknown = {}) => {
    const calls: [string, RequestInit | undefined][] = [];
    const send = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { calls, send };
  };

  it("asks for the queue with only the filters that are set", async () => {
    const { calls, send } = answering(200, { reasons: ["escalated"], entries: [item({})] });
    const loaded = await loadQueue({ reason: "escalated", lane: "" }, send);
    expect(calls[0]![0]).toBe("/api/content-approval/queue?reason=escalated");
    expect(calls[0]![1]).toMatchObject({ credentials: "same-origin" });
    expect(loaded).toEqual({ items: [item({})], reasons: ["escalated"] });
  });

  it("explains a refusal", async () => {
    expect((await loadQueue({ reason: "", lane: "" }, answering(403).send)).error).toBe("Supervisors only.");
    expect((await loadQueue({ reason: "", lane: "" }, answering(500).send)).error).toBe("Could not load the queue.");
  });

  it("resolves an entry with a POST", async () => {
    const { calls, send } = answering(200);
    await resolveEntry("abc", send);
    expect(calls).toEqual([["/api/content-approval/queue/abc/resolve", { method: "POST", credentials: "same-origin" }]]);
  });
});

describe("slice registration", () => {
  it("names the slice, puts its screen under /admin and registers the review job", async () => {
    expect(slice).toMatchObject({ name: "content-approval", nav: { path: "/admin/content-approval" } });
    expect(routes.map((r) => r.path)).toEqual(["/admin/content-approval"]);
  });
});
