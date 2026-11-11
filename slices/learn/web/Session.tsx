import { useState } from "react";
import { SessionCount } from "@mojibun/ui";
import type { Batch, QuizAnswer } from "../contract.ts";
import { ClipLessonCard } from "../listening/web/ClipLessonCard.tsx";
import { isOver, quizOf, sentenceFirst, tallyOf, type Tally } from "./batch-view.ts";
import type { LearnApi } from "./learn-client.ts";
import { LessonCard } from "./LessonCard.tsx";
import { Quiz } from "./Quiz.tsx";

/**
 * The lessons of a batch one by one, counted against the batch's fixed size, then the quiz. An item marked as
 * Known keeps its place in the count and skips the quiz. A Listening Clip is taught whole, quiz included, in its turn.
 */
export const Session = ({ batch, api, now, onFinished }: { batch: Batch; api: LearnApi; now: boolean; onFinished: (tally: Tally) => void }) => {
  const { items } = batch;
  const [at, setAt] = useState(0);
  const [known, setKnown] = useState<string[]>([]);
  const [clipsPassed, setClipsPassed] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [inSentence] = useState(() => sentenceFirst(items));
  const fail = (e: Error) => setFailed(e.message);

  const advance = (knownNow: string[], clips: number) => (isOver(items, at + 1, knownNow) ? onFinished(tallyOf(items, knownNow, clips)) : setAt(at + 1));
  const markKnown = (id: string) =>
    api.skip(id, now).then(() => {
      setKnown([...known, id]);
      advance([...known, id], clipsPassed);
    }, fail);
  const clipDone = () => {
    setClipsPassed(clipsPassed + 1);
    advance(known, clipsPassed + 1);
  };
  const passed = (answers: QuizAnswer[]) => api.complete({ answers, now }).then((n) => onFinished(tallyOf(items, known, n + clipsPassed)), fail);

  const item = items[at];
  return (
    <section className="learn-session">
      {failed && <p role="alert">{failed}</p>}
      {!item ? (
        <Quiz prompts={quizOf(items, known)} preferences={batch.preferences} onPassed={(a) => void passed(a)} />
      ) : (
        <>
          <p className="session-count muted small">
            <SessionCount at={at + 1} of={items.length} />
          </p>
          {"clip" in item ? (
            <ClipLessonCard key={item.clip.studyItemId} clip={item.clip} check={api.answerClip} onPassed={clipDone} />
          ) : (
            <LessonCard
              key={item.lesson.studyItemId}
              lesson={item.lesson}
              prompt={item.prompt}
              inSentence={inSentence.has(item.lesson.studyItemId)}
              last={at === items.length - 1}
              onNext={() => advance(known, clipsPassed)}
              onKnown={() => void markKnown(item.lesson.studyItemId)}
            />
          )}
        </>
      )}
    </section>
  );
};
