import { Hono } from "hono";
import { z } from "zod";
import { createAuthGuards, type AuthEnv, type SessionResolver } from "@mojibun/auth";
import type { Authoring, Row } from "@mojibun/content-graph/authoring";
import type { Rec } from "../src/drafts.ts";
import type { Sampling } from "./sampler.ts";
import { SAMPLE_KINDS, type Sample } from "./types.ts";

const Verdict = z.object({ verdict: z.enum(["confirm", "reject"]), note: z.string().trim().min(1).optional() });
const ReReview = z
  .object({ generationRunId: z.string().min(1), rubricVersion: z.string().min(1), model: z.string().min(1) })
  .partial()
  .refine((f) => Object.keys(f).length > 0, "name a Generation Run, a rubric version or a model");
const Status = z.enum(["pending", "confirmed", "rejected"]);

type Preview = { text: string; translation?: string; audioKey?: string };

const ofSentence = (s: Row<"sentence">): Preview => ({ text: s.text, translation: s.translationEn ?? undefined, audioKey: s.audioKey ?? undefined });

/** What the supervisor reads or listens to for a record: its text, and the audio key when it has one. */
const preview = async (authoring: Authoring, { table, id }: Rec): Promise<Preview> => {
  if (table === "japaneseExplanation") return { text: (await authoring.rows("japaneseExplanation", { id }))[0]?.text ?? "" };
  const [example] = table === "example" ? await authoring.rows("example", { id }) : [];
  const [sentence] = await authoring.rows("sentence", { id: example?.sentenceId ?? id });
  return sentence ? ofSentence(sentence) : { text: `${table} ${id}` };
};

const present = async (authoring: Authoring, s: Sample) => ({
  id: s.id,
  kind: s.kind,
  reason: s.reason,
  status: s.status,
  record: s.primary,
  model: s.model,
  rubricVersion: s.rubricVersion,
  note: s.note,
  at: s.at.toISOString(),
  ...(await preview(authoring, s.primary)),
});

/** Spot-checks for the supervisor: samples to confirm or reject, the error rate and pause of each kind, and re-review (docs/content-approval.md#supervisor-spot-checks). */
export const createSamplingApi = ({ authoring, sampling, sessions }: { authoring: Authoring; sampling: Sampling; sessions: SessionResolver }): Hono => {
  const api = new Hono<AuthEnv>()
    .use(createAuthGuards(sessions).requireRole("supervisor"))
    .get("/spot-checks", async (c) => {
      const status = Status.safeParse(c.req.query("status") ?? "pending");
      if (!status.success) return c.json({ message: "unknown status" }, 400);
      await sampling.sweepClips();
      const samples = await sampling.samples({ status: status.data });
      return c.json({ kinds: await sampling.reports(), samples: await Promise.all(samples.map((s) => present(authoring, s))) });
    })
    .post("/spot-checks/:id/verdict", async (c) => {
      const body = Verdict.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ message: "send a verdict: confirm or reject" }, 400);
      const sample = await sampling.sample(c.req.param("id"));
      if (!sample) return c.json({ message: "no such sample" }, 404);
      if (sample.status !== "pending") return c.json({ message: "already settled" }, 409);
      await sampling.verdict(sample.id, body.data.verdict, body.data.note ?? null);
      return c.json({ settled: sample.id, kinds: await sampling.reports() });
    })
    .post("/kinds/:kind/resume", async (c) => {
      const kind = z.enum(SAMPLE_KINDS).safeParse(c.req.param("kind"));
      if (!kind.success) return c.json({ message: "unknown kind" }, 404);
      await sampling.resume(kind.data);
      return c.json({ kinds: await sampling.reports() });
    })
    .post("/re-reviews", async (c) => {
      const filter = ReReview.safeParse(await c.req.json().catch(() => null));
      if (!filter.success) return c.json({ message: filter.error.issues[0]?.message ?? "bad filter" }, 400);
      return c.json({ queued: await sampling.reReview(filter.data) });
    });
  // The shell mounts a plain Hono; the guard's session variable is read only inside this app.
  return api as unknown as Hono;
};
