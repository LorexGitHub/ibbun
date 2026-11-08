import type { ContentGraph, Example, StudyItemPage, Word } from "@mojibun/content-graph";
import type { Learners } from "@mojibun/learner";
import { StudyItemId, type LearnerId } from "@mojibun/shared";
import type { DueResponse, ReviewPrompt } from "../contract.ts";
import { explanationOf, isReviewable, promptOf } from "./prompt.ts";

/** The Words a Kanji appears in, so the target Word sense's Japanese Explanation can be found. */
const wordsOf = async (graph: ContentGraph, page: StudyItemPage): Promise<Word[]> => {
  if (page.item.type !== "kanji") return [];
  const pages = await Promise.all(
    page.links.flatMap((l) => (l.kind === "contained_in_word" ? [graph.studyItem(StudyItemId.parse(l.word.id))] : [])),
  );
  return pages.flatMap((p) => (p?.item.type === "word" ? [p.item] : []));
};

/** Builds the prompts every kind of Review shares: scheduled Reviews, Wrap-Up re-asks and Ghosts. */
export const createPrompts = (graph: ContentGraph, learners: Learners) => ({
  /** The prompt of a Study Item through the Example `choose` picks from its approved Examples, or null when there is none. */
  async promptThrough(id: StudyItemId, choose: (examples: Example[]) => Example | undefined): Promise<ReviewPrompt | null> {
    const page = await graph.studyItem(id);
    if (!page || !isReviewable(page)) return null;
    const example = choose(page.examples);
    if (!example) return null;
    return promptOf(page, example, explanationOf(page.item, example, await wordsOf(graph, page)));
  },

  async withPreferences(learnerId: LearnerId, prompts: (ReviewPrompt | null)[]): Promise<DueResponse> {
    const { convertRomaji, explanations } = await learners.preferences(learnerId);
    return { preferences: { convertRomaji, explanations }, reviews: prompts.flatMap((p) => (p ? [p] : [])) };
  },

  /** The approved Example of a reviewable Study Item, or null when either is not there. */
  async locate(studyItemId: StudyItemId, exampleId: string) {
    const page = await graph.studyItem(studyItemId);
    const example = page?.examples.find((e) => e.id === exampleId);
    return page && isReviewable(page) && example ? { page, example } : null;
  },
});
