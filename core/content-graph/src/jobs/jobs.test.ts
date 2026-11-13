import { createFakeJobs, type JobContract } from "@ibbun/jobs";
import { describe, expect, it } from "vitest";
import { BatchTextGenerate, ContentGenerate, ContentReview, ListeningSynthesise, PracticeGenerate } from "@ibbun/content-graph/jobs";

const learnerId = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const valid = [
  [BatchTextGenerate, "batch-text.generate", { learnerId, level: "N5", itemIds: [id(1), id(2)] }],
  [PracticeGenerate, "practice.generate", { learnerId, practiceTextId: id(3), level: "N4", kind: "dialogue" }],
  [ListeningSynthesise, "listening.synthesise", { target: { kind: "sentence", sentenceId: id(4) } }],
  [ListeningSynthesise, "listening.synthesise", { target: { kind: "dialogue", passageId: id(5) } }],
  [ContentGenerate, "content.generate", { requestId: id(6), feedback: "unnatural Japanese" }],
  [ContentGenerate, "content.generate", { requestId: id(6) }],
  [ContentReview, "content.review", { requestId: id(6), runId: id(7) }],
] as const;

const invalid = [
  [BatchTextGenerate, { learnerId, level: "N5", itemIds: [] }],
  [BatchTextGenerate, { learnerId, level: "N6", itemIds: [id(1)] }],
  [BatchTextGenerate, { learnerId: "nope", level: "N5", itemIds: [id(1)] }],
  [PracticeGenerate, { learnerId, practiceTextId: id(3), level: "N4", kind: "essay" }],
  [ListeningSynthesise, { target: { kind: "sentence", passageId: id(5) } }],
  [ContentGenerate, {}],
  [ContentReview, { requestId: id(6) }],
] as const;

describe("job contracts", () => {
  it.each(valid)("%#: names the job and round-trips a valid payload", async (c, name, payload) => {
    const contract = c as JobContract;
    expect(contract.name).toBe(name);
    const jobs = createFakeJobs();
    const seen: unknown[] = [];
    await jobs.work([{ contract, handle: async (p: unknown) => void seen.push(p) }]);
    await jobs.enqueue(contract, payload);
    await jobs.drain();
    expect(seen).toEqual([payload]);
    expect(contract.payload.parse(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });

  it.each(invalid)("%#: rejects an invalid payload", (contract, payload) => {
    expect(contract.payload.safeParse(payload).success).toBe(false);
  });

  it("gives every contract a distinct name", () => {
    const names = [BatchTextGenerate, PracticeGenerate, ListeningSynthesise, ContentGenerate, ContentReview].map((c) => c.name);
    expect(new Set(names).size).toBe(5);
  });
});
