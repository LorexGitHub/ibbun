import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSessionResolver } from "@mojibun/auth";
import { createFakeContentGraph, n5Fixture, type N5Fixture } from "@mojibun/content-graph/testing";
import { createFakeLearners } from "@mojibun/learner/testing";
import { createFakeProgress } from "@mojibun/progress/testing";
import type { LearnerId, StudyItemId } from "@mojibun/shared";
import type { DueResponse, ReviewPrompt, SubmitRequest } from "../contract.ts";
import { createReviewsApi } from "./api.ts";

const NOW = new Date("2026-11-06T09:00:00.000Z");
const LEARNED = "2026-11-01T09:00:00.000Z";

const setup = async (mutate: (f: N5Fixture) => void = () => undefined) => {
  const fixture = n5Fixture();
  mutate(fixture);
  const sessions = createFakeSessionResolver();
  const learners = createFakeLearners();
  const progress = createFakeProgress();
  const learner = await learners.add({ email: "a@example.com" });
  const headers = sessions.signIn({ learnerId: learner.id, role: "learner" });
  const api = createReviewsApi({ sessions, learners, progress, contentGraph: createFakeContentGraph(fixture.graph), now: () => NOW });
  const learn = (id: StudyItemId) =>
    progress.record({ learnerId: learner.id, studyItemId: id, kind: "learn", passed: true, at: LEARNED });
  const get = (path: string, as: Headers = headers) => api.request(path, { headers: as });
  const post = (path: string, body: unknown, as: Headers = headers) =>
    api.request(path, { method: "POST", body: JSON.stringify(body), headers: new Headers([...as, ["content-type", "application/json"]]) });
  const due = async () => (await (await get("/due")).json()) as DueResponse;
  return { fixture, learner: learner.id as LearnerId, learners, progress, learn, get, post, due, headers };
};

const answerFor = (prompt: ReviewPrompt, facet: ReviewPrompt["facets"][number]) => {
  if (facet.answerData.facet === "meaning") return facet.answerData.meanings[0]!.text;
  const accepted = facet.answerData.accepted[0]!;
  return accepted.reading ?? accepted.written;
};

const submit = (prompt: ReviewPrompt, override: Partial<SubmitRequest> = {}): SubmitRequest => ({
  studyItemId: prompt.studyItemId,
  exampleId: prompt.exampleId,
  facets: prompt.facets.map((f) => ({ facet: f.facet, input: answerFor(prompt, f), attempts: [] })),
  ...override,
});

describe("the reviews API", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  it("refuses a request with no session", async () => {
    expect((await t.get("/due", new Headers())).status).toBe(401);
    expect((await t.post("/answer", {}, new Headers())).status).toBe(401);
  });

  describe("due Reviews", () => {
    it("lists nothing when nothing has been learned", async () => {
      expect((await t.due()).reviews).toEqual([]);
    });

    it("lists the Study Items due from progress, a Word and a Grammar Point as a cloze", async () => {
      const word = t.fixture.ids.words["水"]!;
      const grammar = Object.values(t.fixture.ids.grammar)[0]!;
      await t.learn(word);
      await t.learn(grammar);
      const { reviews } = await t.due();
      expect(reviews.map((r) => r.studyItemId).sort()).toEqual([word, grammar].sort());
      for (const review of reviews) {
        expect(review.mode).toBe("blank");
        expect(review.facets.map((f) => f.facet)).toEqual(["cloze"]);
        const { before, target, after } = review.sentence;
        expect(before + target + after).toContain(target);
        expect(target).not.toBe("");
      }
    });

    it("leaves out Study Items that are not due yet", async () => {
      const word = t.fixture.ids.words["水"]!;
      await t.progress.record({ learnerId: t.learner, studyItemId: word, kind: "learn", passed: true, at: NOW.toISOString() });
      await t.progress.record({ learnerId: t.learner, studyItemId: word, kind: "srs", passed: true, at: NOW.toISOString() });
      expect((await t.due()).reviews).toEqual([]);
    });

    it("leaves out a Study Item with no approved Example (Suspended)", async () => {
      const t2 = await setup((f) => {
        const id = f.ids.words["水"]!;
        const exampleIds = new Set(f.graph.example.filter((e) => e.studyItemId === id).map((e) => e.id));
        f.graph.example = f.graph.example.filter((e) => !exampleIds.has(e.id));
      });
      await t2.learn(t2.fixture.ids.words["水"]!);
      expect((await t2.due()).reviews).toEqual([]);
    });

    it("reviews a Kanji in context: the Word highlighted, with a reading facet and a meaning facet", async () => {
      await t.learn(t.fixture.ids.kanji["水"]!);
      const [review] = (await t.due()).reviews;
      expect(review!.mode).toBe("highlight");
      expect(review!.facets.map((f) => f.facet)).toEqual(["reading", "meaning"]);
      expect(review!.facets[1]!.answerData.facet).toBe("meaning");
    });

    it("rotates to a different approved Example each Review", async () => {
      const word = t.fixture.ids.words["水"]!;
      await t.learn(word);
      const seen: string[] = [];
      for (let i = 0; i < 2; i++) {
        const [prompt] = (await t.due()).reviews;
        seen.push(prompt!.exampleId);
        const at = new Date(Date.parse(LEARNED) + (i + 1) * 3_600_000).toISOString();
        await t.progress.record({ learnerId: t.learner, studyItemId: word, kind: "srs", passed: false, at, exampleId: prompt!.exampleId });
      }
      expect(seen[0]).not.toBe(seen[1]);
    });

    it("sends the Learner's preferences", async () => {
      await t.learners.changePreferences(t.learner, { convertRomaji: false, explanations: "both" });
      expect((await t.due()).preferences).toEqual({ convertRomaji: false, explanations: "both" });
    });

    it("carries the Japanese Explanation of the target Word sense for a Kanji and of the Grammar Point", async () => {
      await t.learn(t.fixture.ids.kanji["水"]!);
      await t.learn(Object.values(t.fixture.ids.grammar)[0]!);
      const { reviews } = await t.due();
      expect(reviews.every((r) => r.japaneseExplanation)).toBe(true);
    });
  });

  describe("answering", () => {
    const first = async (id: StudyItemId) => {
      await t.learn(id);
      return (await t.due()).reviews[0]!;
    };

    it("re-grades, records a pass with every Review field, and returns the result", async () => {
      const prompt = await first(t.fixture.ids.words["水"]!);
      const response = await t.post("/answer", submit(prompt, { hintsOpened: ["hint"], timeToAnswerMs: 4200, facets: [{ facet: "cloze", input: answerFor(prompt, prompt.facets[0]!), attempts: ["", "taberu"] }] }));
      const body = (await response.json()) as { passed: boolean };
      expect(body.passed).toBe(true);
      const [, review] = await t.progress.log(t.learner, prompt.studyItemId);
      expect(review).toMatchObject({
        kind: "srs",
        passed: true,
        at: NOW.toISOString(),
        exampleId: prompt.exampleId,
        hintsOpened: ["hint"],
        revealed: false,
        timeToAnswerMs: 4200,
        attempts: [{ facet: "cloze", input: "" }, { facet: "cloze", input: "taberu" }],
      });
      expect(review!.facets[0]).toMatchObject({ facet: "cloze", outcome: "pass", rawInput: answerFor(prompt, prompt.facets[0]!) });
      expect(review!.facets[0]!.matchedAnswerId).toBeDefined();
    });

    it("records a fail for a wrong answer", async () => {
      const prompt = await first(t.fixture.ids.words["水"]!);
      const response = await t.post("/answer", submit(prompt, { facets: [{ facet: "cloze", input: "ちがう", attempts: [] }] }));
      expect(await response.json()).toMatchObject({ passed: false, facets: [{ facet: "cloze", outcome: "fail" }] });
      expect((await t.progress.log(t.learner, prompt.studyItemId)).at(-1)).toMatchObject({ passed: false });
    });

    it("never lets hints, the translation or the explanation change the grade", async () => {
      const prompt = await first(t.fixture.ids.words["水"]!);
      const response = await t.post("/answer", submit(prompt, { hintsOpened: ["hint", "translation", "explanation"] }));
      expect(await response.json()).toMatchObject({ passed: true });
    });

    it("counts Show answer as a fail, even with the right input", async () => {
      const prompt = await first(t.fixture.ids.words["水"]!);
      const response = await t.post("/answer", submit(prompt, { revealed: true }));
      expect(await response.json()).toMatchObject({ passed: false, facets: [{ outcome: "fail" }] });
      expect((await t.progress.log(t.learner, prompt.studyItemId)).at(-1)).toMatchObject({ revealed: true, passed: false });
    });

    it("records a revealed Review that has no input at all as a fail", async () => {
      const prompt = await first(t.fixture.ids.words["水"]!);
      const response = await t.post("/answer", submit(prompt, { revealed: true, facets: [{ facet: "cloze", input: "", attempts: [] }] }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ passed: false });
    });

    it("refuses to store an input that is not an answer, so there is nothing to undo or forge", async () => {
      const prompt = await first(t.fixture.ids.words["水"]!);
      for (const input of ["", "taberu"]) {
        const response = await t.post("/answer", submit(prompt, { facets: [{ facet: "cloze", input, attempts: [] }] }));
        expect(response.status).toBe(422);
      }
      expect(await t.progress.log(t.learner, prompt.studyItemId)).toHaveLength(1);
    });

    it("passes a Kanji only when both facets pass", async () => {
      const prompt = await first(t.fixture.ids.kanji["水"]!);
      const [reading, meaning] = prompt.facets;
      const wrongMeaning = submit(prompt, { facets: [{ facet: "reading", input: answerFor(prompt, reading!), attempts: [] }, { facet: "meaning", input: "zzzzzz", attempts: [] }] });
      expect(await (await t.post("/answer", wrongMeaning)).json()).toMatchObject({ passed: false, facets: [{ outcome: "pass" }, { outcome: "fail" }] });
      expect(await (await t.post("/answer", submit(prompt))).json()).toMatchObject({ passed: true });
      expect(answerFor(prompt, meaning!)).toBeTruthy();
    });

    it("refuses an answer that leaves out a facet", async () => {
      const prompt = await first(t.fixture.ids.kanji["水"]!);
      const response = await t.post("/answer", submit(prompt, { facets: [{ facet: "reading", input: "しょく", attempts: [] }] }));
      expect(response.status).toBe(422);
    });

    it("refuses an Example that is not the Study Item's, and a malformed body", async () => {
      const prompt = await first(t.fixture.ids.words["水"]!);
      expect((await t.post("/answer", submit(prompt, { exampleId: "nope" }))).status).toBe(404);
      expect((await t.post("/answer", { nonsense: true })).status).toBe(400);
      expect((await t.post("/answer", "not json at all")).status).toBe(400);
    });
  });
});
