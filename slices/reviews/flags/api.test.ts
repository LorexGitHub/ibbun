import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@mojibun/auth";
import { createFakeAuthoring, emptyGraph } from "@mojibun/content-graph/testing";
import { createFakeAnswerFlags } from "@mojibun/content-graph/flags/testing";
import { createFakeProgress } from "@mojibun/progress/testing";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import { createFlagsApi } from "./api.ts";

const WORD = StudyItemId.parse("00000000-0000-4000-8000-000000000001");
const EXAMPLE = "00000000-0000-4000-8000-0000000000e1";
const AT = "2026-11-06T09:00:00.000Z";

const setup = () => {
  const sessions = createFakeSessionResolver();
  const progress = createFakeProgress();
  const graph = emptyGraph();
  const learnerId = LearnerId.parse("00000000-0000-4000-8000-00000000000a");
  const headers = sessions.signIn({ learnerId, role: "learner" });
  const api = createFlagsApi({ sessions, progress, answerFlags: createFakeAnswerFlags(graph) });
  const review = (detail: object = {}) =>
    progress.record({
      learnerId,
      studyItemId: WORD,
      kind: "srs",
      passed: false,
      at: AT,
      exampleId: EXAMPLE,
      facets: [{ facet: "cloze", rawInput: "みづ", normalisedInput: "みづ", outcome: "fail" }],
      ...detail,
    });
  const flag = (body: unknown, as: Headers = headers) =>
    api.request("/flag", { method: "POST", body: JSON.stringify(body), headers: new Headers([...as, ["content-type", "application/json"]]) });
  const queued = () => createFakeAuthoring(graph).queue({ reason: "answer flag" });
  return { sessions, progress, learnerId, review, flag, queued };
};

describe("flagging a graded facet", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("refuses a request with no session", async () => {
    expect((await t.flag({}, new Headers())).status).toBe(401);
  });

  it("queues the Example with the Review, the facet and the typed input", async () => {
    const review = await t.review();
    const response = await t.flag({ studyItemId: WORD, exampleId: EXAMPLE, facet: "cloze" });
    expect(response.status).toBe(201);
    expect(await t.queued()).toMatchObject([{ recordId: EXAMPLE, detail: { reviewId: review.id, facet: "cloze", input: "みづ" } }]);
  });

  it("takes the input from the Review log, not from the request", async () => {
    const review = await t.review();
    await t.flag({ studyItemId: WORD, exampleId: EXAMPLE, facet: "cloze", input: "forged" });
    expect((await t.queued())[0]!.detail).toMatchObject({ input: "みづ" });
  });

  it("does not regrade the past Review or append to the log", async () => {
    const review = await t.review();
    await t.flag({ studyItemId: WORD, exampleId: EXAMPLE, facet: "cloze" });
    expect(await t.progress.log(t.learnerId, WORD)).toEqual([review]);
  });

  it("queues a repeated flag once", async () => {
    const review = await t.review();
    await t.flag({ studyItemId: WORD, exampleId: EXAMPLE, facet: "cloze" });
    expect((await t.flag({ studyItemId: WORD, exampleId: EXAMPLE, facet: "cloze" })).status).toBe(201);
    expect(await t.queued()).toHaveLength(1);
  });

  it("flags the latest Review of the Example, and ignores Reviews of other kinds", async () => {
    await t.review();
    const latest = await t.review();
    await t.review({ kind: "learn" });
    await t.flag({ studyItemId: WORD, exampleId: EXAMPLE, facet: "cloze" });
    expect((await t.queued())[0]!.detail).toMatchObject({ reviewId: latest.id });
  });

  it("flags a Wrap-Up or Ghost answer too, but not a Learn or Cram one", async () => {
    await t.review({ kind: "wrap-up" });
    expect((await t.flag({ studyItemId: WORD, exampleId: EXAMPLE, facet: "cloze" })).status).toBe(201);
    const other = setup();
    await other.review({ kind: "cram" });
    expect((await other.flag({ studyItemId: WORD, exampleId: EXAMPLE, facet: "cloze" })).status).toBe(404);
  });

  it("refuses what is not a valid flag", async () => {
    expect((await t.flag({ exampleId: "x" })).status).toBe(400);
  });

  it("refuses a Review that is not in the Learner's log", async () => {
    expect((await t.flag({ studyItemId: WORD, exampleId: "nope", facet: "cloze" })).status).toBe(404);
    const review = await t.review();
    const stranger = t.sessions.signIn({ learnerId: LearnerId.parse("00000000-0000-4000-8000-00000000000b"), role: "learner" });
    expect((await t.flag({ studyItemId: WORD, exampleId: EXAMPLE, facet: "cloze" }, stranger)).status).toBe(404);
  });

  it.each([
    ["a facet the Review did not grade", { facet: "reading" }, {}],
    ["a Kanji meaning", { facet: "meaning" }, { facets: [{ facet: "meaning", rawInput: "wat", normalisedInput: "wat", outcome: "fail" }] }],
    ["an answer marked right", { facet: "cloze" }, { passed: true, facets: [{ facet: "cloze", rawInput: "水", normalisedInput: "水", outcome: "pass" }] }],
    ["an answer shown by Show answer", { facet: "cloze" }, { revealed: true }],
    ["an empty input", { facet: "cloze" }, { facets: [{ facet: "cloze", rawInput: " ", normalisedInput: "", outcome: "fail" }] }],
  ])("refuses %s", async (_, request, detail) => {
    const review = await t.review(detail);
    expect((await t.flag({ studyItemId: WORD, exampleId: EXAMPLE, ...request })).status).toBe(422);
    expect(await t.queued()).toEqual([]);
  });
});
