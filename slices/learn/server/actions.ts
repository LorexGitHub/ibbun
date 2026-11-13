import type { Progress } from "@ibbun/progress";
import type { LearnerId, StudyItemId } from "@ibbun/shared";
import { CompleteRequest, SkipRequest } from "../contract.ts";
import { gradeQuiz, recordQuiz, type Refusal } from "./complete.ts";
import type { Teacher } from "./teach.ts";

export type { Refusal };

/** "I know this" and the quiz pass: what Learn and Learn now write to `progress`. */
export const createActions = ({ teacher, progress, now }: { teacher: Teacher; progress: Progress; now: () => Date }) => {
  const skip = async (learnerId: LearnerId, body: unknown): Promise<{ studyItemId: StudyItemId } | { refusal: Refusal }> => {
    const request = SkipRequest.safeParse(body);
    if (!request.success) return { refusal: { status: 400, message: "not a valid Study Item" } };
    const { studyItemId, now: learnNow } = request.data;
    if (!(await teacher.isTaught(studyItemId))) return { refusal: { status: 404, message: "no such Study Item" } };
    const source = learnNow ? "learn-now" : "learn-skip";
    await progress.record({ learnerId, studyItemId, kind: "manual", passed: true, at: now().toISOString(), source });
    return { studyItemId };
  };

  const complete = async (learnerId: LearnerId, body: unknown): Promise<{ recorded: number } | { refusal: Refusal }> => {
    const request = CompleteRequest.safeParse(body);
    if (!request.success) return { refusal: { status: 400, message: "not a valid quiz" } };
    const checked = await gradeQuiz(teacher.locate, request.data.answers);
    if ("refusal" in checked) return checked;
    await recordQuiz(progress, learnerId, checked.graded, now(), request.data.now === true);
    return { recorded: checked.graded.length };
  };

  return { skip, complete };
};
