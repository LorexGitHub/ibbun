import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadSpotChecks, queueReReview, resumeKind, sendVerdict, SpotChecksScreen, type KindReport, type SampleItem } from "./web.tsx";
import { routes } from "../web.tsx";

const kind = (over: Partial<KindReport> = {}): KindReport => ({ kind: "example", paused: false, calibrationLeft: 0, sampled: 10, errorRate: 0.1, ...over });
const sample = (over: Partial<SampleItem> = {}): SampleItem => ({
  id: "s1",
  kind: "example",
  reason: "random",
  record: { table: "example", id: "rec-1" },
  model: "opus",
  rubricVersion: "v1",
  at: "2026-11-07T10:00:00Z",
  text: "水を飲む。",
  translation: "I drink water.",
  ...over,
});

/** The page as text: React puts `<!-- -->` between a string and an interpolated value. */
const render = (props: Partial<Parameters<typeof SpotChecksScreen>[0]> = {}) =>
  renderToString(<SpotChecksScreen kinds={[kind()]} samples={[sample()]} onVerdict={() => {}} onResume={() => {}} onReReview={() => {}} {...props} />).replaceAll("<!-- -->", "");

describe("spot-checks screen", () => {
  it("shows each kind's error rate and each sample's text, reviewer and why it was drawn", () => {
    const html = render();
    expect(html).toContain("Examples");
    expect(html).toContain("Error rate 10% of the last 10 sampled (up to 50)");
    expect(html).toContain("auto-approving");
    expect(html).toContain("水を飲む。");
    expect(html).toContain("I drink water.");
    expect(html).toContain("opus, rubric v1");
    expect(html).toContain("random sample of the reviewer&#x27;s approvals");
    expect(html).toContain("Looks right");
    expect(html).toContain("Reject");
  });

  it("offers Resume only on a paused kind, and says approvals wait", () => {
    expect(render()).not.toContain("Resume");
    const html = render({ kinds: [kind({ paused: true, errorRate: 0.2 })], samples: [sample({ reason: "held" })] });
    expect(html).toContain("auto-approval paused");
    expect(html).toContain("Resume Examples");
    expect(html).toContain("not live until you approve it");
    expect(html).toContain(">Approve<");
  });

  it("says when a kind is calibrating", () => {
    expect(render({ kinds: [kind({ calibrationLeft: 12 })] })).toContain("the next 12 approvals are all sampled");
  });

  it("tells the supervisor to listen to a Listening Clip", () => {
    const html = render({ kinds: [kind({ kind: "listening-clip" })], samples: [sample({ kind: "listening-clip", audioKey: "audio/1.mp3" })] });
    expect(html).toContain("Listening Clips");
    expect(html).toContain("Listen to this clip (audio audio/1.mp3)");
    expect(render()).not.toContain("Listen to this clip");
  });

  it("says when nothing waits, or why the spot-checks could not load", () => {
    expect(render({ samples: [] })).toContain("No samples are waiting.");
    const html = render({ samples: [], error: "Supervisors only." });
    expect(html).toContain("Supervisors only.");
    expect(html).not.toContain("No samples are waiting.");
  });

  it("offers a re-review by Generation Run, rubric version or model, and reports how many it queued", () => {
    const html = render({ queued: 3 });
    for (const label of ["Generation Run", "Rubric version", "Model"]) expect(html).toContain(label);
    expect(html).toContain("3 queued.");
    expect(render()).not.toContain("queued.");
  });

  it("is a second route of the slice", () => {
    expect(routes.map((r) => r.path)).toEqual(["/admin/content-approval", "/admin/content-approval/spot-checks"]);
  });
});

const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("spot-check requests", () => {
  it("loads kinds and samples, and explains a refusal", async () => {
    expect(await loadSpotChecks(reply(200, { kinds: [kind()], samples: [sample()] }))).toMatchObject({ samples: [{ id: "s1" }] });
    expect((await loadSpotChecks(reply(403))).error).toBe("Supervisors only.");
    expect((await loadSpotChecks(reply(500))).error).toBe("Could not load the spot-checks.");
  });

  it("posts a verdict with its note, only when there is one", async () => {
    const send = reply(200);
    await sendVerdict("s1", "reject", " wrong sense ", send);
    await sendVerdict("s1", "confirm", "  ", send);
    const calls = (send as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    expect(calls[0]![0]).toBe("/api/content-approval/sampling/spot-checks/s1/verdict");
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({ verdict: "reject", note: "wrong sense" });
    expect(JSON.parse(calls[1]![1].body as string)).toEqual({ verdict: "confirm" });
  });

  it("resumes a kind and queues a re-review", async () => {
    const resume = reply(200);
    await resumeKind("example", resume);
    expect((resume as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe("/api/content-approval/sampling/kinds/example/resume");
    expect(await queueReReview({ model: "opus" }, reply(200, { queued: 4 }))).toBe(4);
    expect(await queueReReview({}, reply(400))).toBeNull();
  });
});
