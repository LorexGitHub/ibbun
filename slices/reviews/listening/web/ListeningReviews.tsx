import { useEffect, useState } from "react";
import { useLoaded } from "../../web/http.ts";
import { answerClip, loadDueClips, type AnswerClip, type LoadClips } from "./clip-reviews-client.ts";
import { ClipReviewCard } from "./ClipReviewCard.tsx";

type Props = { load?: LoadClips; answer?: AnswerClip; onFinish: () => void };

/** The due Listening Clips, one after another; `onFinish` is called after the last, or at once when none are due. */
export const ListeningReviews = ({ load = loadDueClips, answer = answerClip, onFinish }: Props) => {
  const { data: due, failed } = useLoaded(load);
  const [at, setAt] = useState(0);
  const finished = due !== null && !due.clips[at];
  useEffect(() => {
    if (finished) onFinish();
  }, [finished]);

  if (failed) return <p role="alert">{failed}</p>;
  if (!due) return <p>Loading…</p>;
  const review = due.clips[at];
  if (!review) return null;
  return (
    <section>
      <h2>Listening</h2>
      <p>
        {at + 1} of {due.clips.length}
      </p>
      <ClipReviewCard key={`${review.clipId}-${at}`} review={review} answer={answer} onDone={() => setAt(at + 1)} />
    </section>
  );
};
