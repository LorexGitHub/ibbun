import type { ApprovalDecision, RecordTable } from "@ibbun/content-graph/authoring";
import { newSample, type Context } from "./context.ts";
import { draw } from "./rules.ts";

/** Clip audio is approved by a derived process whose name starts `listening`, so no reviewer ever sees it. */
const isClipAudio = (d: ApprovalDecision): boolean => d.outcome === "approved" && d.decider.kind === "derived" && d.decider.process.startsWith("listening");

const versionOf = (d: ApprovalDecision): string => (d.decider.kind === "derived" ? `${d.decider.process}/${d.decider.version}` : "");

const drawOne = async (c: Context, d: ApprovalDecision) => {
  const drawn = draw(await c.store.state("listening-clip"), versionOf(d), c.config, c.random);
  await c.store.saveState({ ...drawn.state, cursor: d.at });
  if (!drawn.reason) return;
  const primary = { table: d.recordTable as RecordTable, id: d.recordId };
  await c.store.add(newSample(c, { kind: "listening-clip", reason: drawn.reason, primary, unit: [primary], decisionId: d.id }));
};

/**
 * Draws Listening Clip approvals the same way as the reviewer's (docs/content-approval.md#listening-clips), oldest first.
 * The kind's cursor remembers how far it got, so running it again draws nothing twice.
 */
export const sweepClips = async (c: Context) => {
  const since = (await c.store.state("listening-clip")).cursor;
  const fresh = (await c.authoring.rows("approvalDecision")).filter((d) => isClipAudio(d) && (!since || d.at > since));
  for (const d of fresh.sort((a, b) => a.at.getTime() - b.at.getTime())) await drawOne(c, d);
};
