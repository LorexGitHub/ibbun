import { useEffect, useState } from "react";
import { Card } from "@ibbun/ui";
import type { StudyItemId } from "@ibbun/shared";
import type { DueResponse, ReviewPrompt, SubmitResponse } from "../contract.ts";
import { ReviewCard, type Submit } from "../web/ReviewCard.tsx";

/** A Study Item missed in the session, with the Examples already asked of it. */
export type Miss = { studyItemId: StudyItemId; asked: string[] };

export type LoadWrapUp = (studyItemId: StudyItemId, asked: string[]) => Promise<DueResponse>;

/** The queue after the head was answered: gone when right, back at the end, with its Example noted, when wrong. */
export const afterAnswer = (queue: Miss[], exampleId: string, passed: boolean): Miss[] => {
  const [head, ...rest] = queue;
  return passed || !head ? rest : [...rest, { ...head, asked: [...head.asked, exampleId] }];
};

/** Asks every missed Study Item again, each time through a different Example where one exists, until it is answered right. */
export const WrapUp = ({ misses, load, submit, onFinish }: { misses: Miss[]; load: LoadWrapUp; submit: Submit; onFinish: () => void }) => {
  const [queue, setQueue] = useState(misses);
  const [asking, setAsking] = useState<{ prompt: ReviewPrompt; preferences: DueResponse["preferences"] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const head = queue[0];

  useEffect(() => {
    if (!head) return onFinish();
    setAsking(null);
    load(head.studyItemId, head.asked).then(
      ({ reviews, preferences }) => (reviews[0] ? setAsking({ prompt: reviews[0], preferences }) : setQueue((now) => now.slice(1))),
      (e: Error) => setFailed(e.message),
    );
  }, [head]);

  if (failed) return <p role="alert">{failed}</p>;
  if (!head || !asking) return null;
  const answered = ({ passed }: SubmitResponse) => setQueue((now) => afterAnswer(now, asking.prompt.exampleId, passed));
  return (
    <section aria-label="Wrap-Up">
      <h2>Wrap-Up</h2>
      <p>{queue.length} to get right</p>
      <Card>Missed earlier. Answer it again; only your first answer counted.</Card>
      <ReviewCard key={asking.prompt.exampleId + queue.length} prompt={asking.prompt} preferences={asking.preferences} submit={submit} onDone={answered} />
    </section>
  );
};
