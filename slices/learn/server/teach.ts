import type { ContentGraph, StudyItemPage, Word } from "@mojibun/content-graph";
import { StudyItemId } from "@mojibun/shared";
import { lessonOf } from "./lesson.ts";
import { explanationOf, isTaught, promptOf } from "./prompt.ts";

/** The Words a Kanji appears in, so the target Word sense's Japanese Explanation can be found. */
const wordsOf = async (graph: ContentGraph, page: StudyItemPage): Promise<Word[]> => {
  if (page.item.type !== "kanji") return [];
  const pages = await Promise.all(
    page.links.flatMap((l) => (l.kind === "contained_in_word" ? [graph.studyItem(StudyItemId.parse(l.word.id))] : [])),
  );
  return pages.flatMap((p) => (p?.item.type === "word" ? [p.item] : []));
};

/** The lesson and the quiz question of a Study Item, or null while it has no approved Example. */
const teach = async (graph: ContentGraph, id: StudyItemId) => {
  const page = await graph.studyItem(id);
  const example = page?.examples[0];
  if (!page || !isTaught(page) || !example) return null;
  const explanation = explanationOf(page.item, example, await wordsOf(graph, page));
  return { lesson: lessonOf(page, example, explanation), prompt: promptOf(page, example, explanation) };
};

/** The approved Example of a taught Study Item, or null when either is not there. */
const locate = async (graph: ContentGraph, studyItemId: StudyItemId, exampleId: string) => {
  const page = await graph.studyItem(studyItemId);
  const example = page?.examples.find((e) => e.id === exampleId);
  return page && isTaught(page) && example ? { page, example } : null;
};

/** Reads Study Items from the Content Graph as something Learn teaches and quizzes. */
export const createTeacher = (graph: ContentGraph) => ({
  teach: (id: StudyItemId) => teach(graph, id),
  locate: (studyItemId: StudyItemId, exampleId: string) => locate(graph, studyItemId, exampleId),
  /** Whether the Study Item is one Learn can teach. */
  isTaught: async (studyItemId: StudyItemId) => {
    const page = await graph.studyItem(studyItemId);
    return page !== null && isTaught(page);
  },
});

export type Teacher = ReturnType<typeof createTeacher>;
