import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LearnerId, StudyItemId } from "@mojibun/shared";
import type { Progress } from "../progress.ts";
import type { NewReview } from "../review.ts";

const learner = () => LearnerId.parse(randomUUID());
const item = () => StudyItemId.parse(randomUUID());
const DAY = 86_400_000;
const T0 = Date.parse("2026-11-01T00:00:00.000Z");
const day = (n: number) => new Date(T0 + n * DAY).toISOString();

type Kind = NewReview["kind"];
const rev = (l: LearnerId, i: StudyItemId, kind: Kind, passed: boolean, at: string): NewReview =>
  ({ learnerId: l, studyItemId: i, kind, passed, at });

/** Behaviour the real module and the fake share. */
export const progressContract = (make: () => Promise<Progress>) => {
  const setup = async (...steps: [Kind, boolean, number][]) => {
    const progress = await make();
    const l = learner();
    const i = item();
    for (const [kind, passed, n] of steps) await progress.record(rev(l, i, kind, passed, day(n)));
    return { progress, l, i, now: async () => progress.item(l, i) };
  };

  describe("the Review log", () => {
    it("appends Reviews with every recorded field and reads them back oldest first", async () => {
      const progress = await make();
      const l = learner();
      const i = item();
      const listening: NewReview = {
        ...rev(l, i, "srs", true, "2026-11-02T09:00:00+09:00"),
        exampleId: "ex-1",
        facets: [{ facet: "dictation", rawInput: "ねこ", normalisedInput: "ねこ", outcome: "pass", matchedAnswerId: "a1" }],
        attempts: [{ facet: "dictation", input: "ね" }],
        hintsOpened: ["reading"],
        revealed: false,
        timeToAnswerMs: 4200,
        listening: { replays: 2, slow: true, examMode: false },
      };
      const second = await progress.record(listening);
      const first = await progress.record(rev(l, i, "learn", true, day(0)));
      expect(second.at).toBe("2026-11-02T00:00:00.000Z");
      expect(await progress.log(l)).toEqual([first, second]);
      expect(await progress.log(l, i)).toEqual([first, second]);
      expect(await progress.log(l, item())).toEqual([]);
      expect(await progress.log(learner())).toEqual([]);
    });

    it("keeps Reviews at the same time in the order they were recorded", async () => {
      const progress = await make();
      const l = learner();
      const i = item();
      const a = await progress.record(rev(l, i, "cram", true, day(0)));
      const b = await progress.record(rev(l, i, "cram", false, day(0)));
      expect((await progress.log(l)).map((r) => r.id)).toEqual([a.id, b.id]);
    });

    it("refuses a Review that does not parse", async () => {
      const progress = await make();
      await expect(progress.record({ ...rev(learner(), item(), "srs", true, day(0)), kind: "quiz" as Kind })).rejects.toThrow();
      expect(await progress.log(learner())).toEqual([]);
    });
  });

  describe("Mastery", () => {
    it("is New with nothing due before Learn is passed", async () => {
      const { now, i } = await setup(["learn", false, 0], ["cram", true, 0], ["lookup", true, 0]);
      expect(await now()).toEqual({ studyItemId: i, mastery: "new", known: false, introduced: false, due: null });
    });

    it("is Learning, due straight away, once Learn is passed", async () => {
      const { now } = await setup(["learn", true, 0]);
      expect(await now()).toMatchObject({ mastery: "learning", known: false, introduced: true, due: new Date(day(0)) });
    });

    it("stays Learning when the first scheduled Review fails", async () => {
      const { now } = await setup(["learn", true, 0], ["srs", false, 0]);
      expect(await now()).toMatchObject({ mastery: "learning", known: false });
    });

    it("is Young and Known after a passed scheduled Review, which graduates past the one 4h step", async () => {
      const { now } = await setup(["learn", true, 0], ["srs", true, 0]);
      expect(await now()).toMatchObject({ mastery: "young", known: true, due: new Date(day(2)) });
    });

    it("comes back 4 hours after a failed scheduled Review", async () => {
      const { now } = await setup(["learn", true, 0], ["srs", false, 0]);
      expect(await now()).toMatchObject({ due: new Date(T0 + 4 * 3_600_000) });
    });

    it("is Known and Young after 'I know this'", async () => {
      const { now } = await setup(["manual", true, 0]);
      expect(await now()).toMatchObject({ mastery: "young", known: true, introduced: true });
    });

    it("becomes Mature after enough passed Reviews", async () => {
      const { now } = await setup(["learn", true, 0], ["srs", true, 0], ["srs", true, 1], ["srs", true, 5]);
      expect(await now()).toMatchObject({ mastery: "mature", due: new Date(day(28)) });
    });

    it("is Relearning after a Lapse, stays Known, and leaves Relearning when passed", async () => {
      const lapsed = await setup(["learn", true, 0], ["srs", true, 0], ["srs", true, 1], ["srs", false, 5]);
      expect(await lapsed.now()).toMatchObject({ mastery: "relearning", known: true });
      const passed = await setup(["learn", true, 0], ["srs", true, 0], ["srs", true, 1], ["srs", false, 5], ["srs", true, 6]);
      expect(await passed.now()).toMatchObject({ mastery: "young", known: true });
    });

    it("ignores every kind except srs and manual when scheduling", async () => {
      const plain = await setup(["learn", true, 0], ["srs", true, 0]);
      const noisy = await setup(
        ["learn", true, 0], ["srs", true, 0], ["wrap-up", false, 0], ["ghost", false, 0],
        ["cram", false, 0], ["lookup", true, 0], ["learn", false, 0],
      );
      expect({ ...(await noisy.now()), studyItemId: null }).toEqual({ ...(await plain.now()), studyItemId: null });
    });
  });

  describe("reads across items", () => {
    it("lists due, Known and Introduced items for one Learner only", async () => {
      const progress = await make();
      const l = learner();
      const [learnt, reviewed, claimed, met] = [item(), item(), item(), item()];
      await progress.record(rev(l, learnt, "learn", true, day(2)));
      await progress.record(rev(l, reviewed, "learn", true, day(0)));
      await progress.record(rev(l, reviewed, "srs", true, day(0)));
      await progress.record({ ...rev(l, claimed, "manual", true, day(0)), source: "placement" });
      await progress.record(rev(l, met, "lookup", true, day(0)));
      await progress.record(rev(learner(), item(), "learn", true, day(0)));

      expect(await progress.due(l, new Date(day(1)))).toEqual([]);
      expect(await progress.due(l, new Date(day(2)))).toEqual([reviewed, learnt]);
      expect(await progress.due(l, new Date(day(10)))).toEqual([reviewed, learnt, claimed]);
      expect(new Set(await progress.known(l))).toEqual(new Set([reviewed, claimed]));
      expect(new Set(await progress.introduced(l))).toEqual(new Set([learnt, reviewed, claimed]));
      expect((await progress.items(l)).map((p) => p.studyItemId).sort()).toEqual([learnt, reviewed, claimed].sort());
    });
  });

  describe("met", () => {
    it("is true for an Example or Study Item any Learner has a Review of, and false otherwise", async () => {
      const progress = await make();
      const [seen, other] = [item(), item()];
      await progress.record({ ...rev(learner(), seen, "srs", true, day(0)), exampleId: "ex-1" });
      expect(await progress.met({ exampleId: "ex-1" })).toBe(true);
      expect(await progress.met({ exampleId: "ex-2" })).toBe(false);
      expect(await progress.met({ studyItemId: seen })).toBe(true);
      expect(await progress.met({ studyItemId: other })).toBe(false);
    });
  });

  it("rebuilds identical state when its log is replayed into a fresh Progress", async () => {
    const { progress, l } = await setup(["learn", true, 0], ["srs", true, 0], ["srs", false, 3], ["srs", true, 4]);
    await progress.record(rev(l, item(), "manual", true, day(1)));
    const fresh = await make();
    for (const r of await progress.log(l)) await fresh.record(r);
    expect(await fresh.items(l)).toEqual(await progress.items(l));
  });
};
