import { useState, type ReactNode } from "react";
import { useLoaded } from "../../web/http.ts";
import { answerClip, loadDueClips, type AnswerClip, type LoadClips } from "./clip-reviews-client.ts";
import { ClipReviewCard } from "./ClipReviewCard.tsx";

type Props = { load?: LoadClips; answer?: AnswerClip; empty: ReactNode };

/** The due Listening Clips, one after another; `empty` shows when none are due. */
export const ListeningReviews = ({ load = loadDueClips, answer = answerClip, empty }: Props) => {
  const { data: due, failed } = useLoaded(load);
  const [at, setAt] = useState(0);

  if (failed) return <p role="alert">{failed}</p>;
  if (!due) return <p>Loading…</p>;
  const review = due.clips[at];
  if (!review) return <>{empty}</>;
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
