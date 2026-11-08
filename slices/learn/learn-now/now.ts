import type { LearningPath } from "@mojibun/learning-path";
import { StudyItemId } from "@mojibun/shared";
import type { Refusal } from "../server/actions.ts";
import type { Teacher } from "../server/teach.ts";

/** Learn now: the item and its pulled-in dependencies from `forItem()`, locked or not and whatever the budget says. */
export const createNowIds =
  ({ teacher, learningPath }: { teacher: Teacher; learningPath: LearningPath }) =>
  async (learnerId: Parameters<LearningPath["forItem"]>[0], raw: string): Promise<StudyItemId[] | { refusal: Refusal }> => {
    const id = StudyItemId.safeParse(raw);
    if (!id.success) return { refusal: { status: 400, message: "not a valid Study Item" } };
    if (!(await teacher.isTaught(id.data))) return { refusal: { status: 404, message: "no such Study Item" } };
    return learningPath.forItem(learnerId, id.data);
  };
