import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LearnerId } from "@ibbun/shared";
import type { AuthEvent } from "./events.ts";
import type { Learner, Learners, NewLearner } from "./learners.ts";
import { DEFAULT_PREFERENCES } from "./preferences.ts";

/** One Learners implementation under test, with a way to make accounts and see what it logged. */
export type LearnersHarness = {
  learners: Learners;
  add: (learner: NewLearner) => Promise<Learner>;
  events: AuthEvent[];
};

const email = () => `${randomUUID()}@ibbun.test`;
const unknownId = () => LearnerId.parse(randomUUID());

/** Behaviour the real module and the fake share. */
export const learnersContract = (make: () => Promise<LearnersHarness>) => {
  describe("identity", () => {
    it("reads a Learner by ID and by email, new accounts as plain Learners", async () => {
      const { learners, add } = await make();
      const address = email();
      const added = await add({ email: address });
      expect(added).toMatchObject({ email: address, role: "learner", deactivated: false });
      expect(await learners.get(added.id)).toEqual(added);
      expect(await learners.findByEmail(address)).toEqual(added);
    });

    it("finds an email whatever its case", async () => {
      const { learners, add } = await make();
      const added = await add({ email: "Mika.Tanaka@Ibbun.test" });
      expect(added.email).toBe("mika.tanaka@ibbun.test");
      expect((await learners.findByEmail("MIKA.tanaka@ibbun.TEST"))!.id).toBe(added.id);
    });

    it("answers null for an unknown Learner", async () => {
      const { learners } = await make();
      expect(await learners.get(unknownId())).toBeNull();
      expect(await learners.findByEmail(email())).toBeNull();
    });
  });

  describe("roles", () => {
    it("makes a Learner a Supervisor and back, and logs each change", async () => {
      const { learners, add, events } = await make();
      const added = await add({ email: email() });
      await learners.setRole(added.id, "supervisor");
      expect((await learners.get(added.id))!.role).toBe("supervisor");
      await learners.setRole(added.id, "learner");
      expect((await learners.get(added.id))!.role).toBe("learner");
      expect(events.filter((e) => e.type === "role-changed")).toEqual([
        { type: "role-changed", learnerId: added.id, role: "supervisor" },
        { type: "role-changed", learnerId: added.id, role: "learner" },
      ]);
    });

    it("refuses to change the role of an unknown Learner", async () => {
      const { learners } = await make();
      await expect(learners.setRole(unknownId(), "supervisor")).rejects.toThrow(/no Learner/);
    });
  });

  describe("deactivation", () => {
    it("deactivates and reactivates a Learner, and logs both", async () => {
      const { learners, add, events } = await make();
      const added = await add({ email: email() });
      await learners.setDeactivated(added.id, true);
      expect((await learners.get(added.id))!.deactivated).toBe(true);
      await learners.setDeactivated(added.id, false);
      expect((await learners.get(added.id))!.deactivated).toBe(false);
      expect(events.filter((e) => e.type === "deactivated" || e.type === "reactivated")).toEqual([
        { type: "deactivated", learnerId: added.id },
        { type: "reactivated", learnerId: added.id },
      ]);
    });
  });

  describe("preferences", () => {
    it("starts from the defaults", async () => {
      const { learners, add } = await make();
      const added = await add({ email: email() });
      expect(await learners.preferences(added.id)).toEqual(DEFAULT_PREFERENCES);
    });

    it("keeps a change, and later changes build on it", async () => {
      const { learners, add } = await make();
      const added = await add({ email: email() });
      expect(await learners.changePreferences(added.id, { furigana: "off", batchSize: 8 })).toEqual({
        ...DEFAULT_PREFERENCES,
        furigana: "off",
        batchSize: 8,
      });
      await learners.changePreferences(added.id, { explanations: "both" });
      expect(await learners.preferences(added.id)).toEqual({
        ...DEFAULT_PREFERENCES,
        furigana: "off",
        batchSize: 8,
        explanations: "both",
      });
    });

    it("keeps each Learner's preferences apart", async () => {
      const { learners, add } = await make();
      const a = await add({ email: email() });
      const b = await add({ email: email() });
      await learners.changePreferences(a.id, { examMode: true });
      expect((await learners.preferences(a.id)).examMode).toBe(true);
      expect((await learners.preferences(b.id)).examMode).toBe(false);
    });

    it("refuses an invalid change and keeps what was there", async () => {
      const { learners, add } = await make();
      const added = await add({ email: email() });
      await learners.changePreferences(added.id, { batchSize: 9 });
      await expect(learners.changePreferences(added.id, { batchSize: 0 })).rejects.toThrow();
      expect((await learners.preferences(added.id)).batchSize).toBe(9);
    });

    it("refuses preferences of an unknown Learner", async () => {
      const { learners } = await make();
      await expect(learners.preferences(unknownId())).rejects.toThrow(/no Learner/);
      await expect(learners.changePreferences(unknownId(), {})).rejects.toThrow(/no Learner/);
    });
  });
};
