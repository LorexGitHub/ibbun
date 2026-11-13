import type { Example } from "@ibbun/content-graph";

/**
 * The Example a Wrap-Up re-ask uses: one not asked yet this session, so the Learner can't just repeat the answer
 * they were shown. When every Example has been asked, any but the latest; a lone Example is asked again.
 */
export const pickDifferent = (examples: Example[], asked: string[]): Example | undefined =>
  examples.find((e) => !asked.includes(e.id)) ?? examples.find((e) => e.id !== asked.at(-1)) ?? examples[0];
