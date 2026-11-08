import { useState } from "react";
import { Card } from "@mojibun/ui";
import { DueResponse, SubmitResponse, type SubmitRequest } from "../contract.ts";
import { ListeningReviews } from "../listening/web/ListeningReviews.tsx";
import type { LoadClips } from "../listening/web/clip-reviews-client.ts";
import { call, postJson, useLoaded } from "./http.ts";
import { ReviewCard, type Submit } from "./ReviewCard.tsx";

export const loadDue = async (): Promise<DueResponse> => DueResponse.parse(await call("/due"));

export const submitAnswer: Submit = async (request: SubmitRequest) =>
  SubmitResponse.parse(await postJson("/answer", request));

type Props = { load?: () => Promise<DueResponse>; submit?: Submit; loadClips?: LoadClips };

/** The review session: due Reviews one after another, then the due Listening Clips. */
export const ReviewsScreen = ({ load = loadDue, submit = submitAnswer, loadClips }: Props) => {
  const { data: due, failed } = useLoaded(load);
  const [at, setAt] = useState(0);

  if (failed) return <p role="alert">{failed}</p>;
  if (!due) return <p>Loading…</p>;
  const prompt = due.reviews[at];
  if (!prompt) return <ListeningReviews load={loadClips} empty={<Card>No Reviews are due. Come back later.</Card>} />;
  return (
    <section>
      <h1>Reviews</h1>
      <p>
        {at + 1} of {due.reviews.length}
      </p>
      <ReviewCard key={prompt.exampleId + at} prompt={prompt} preferences={due.preferences} submit={submit} onDone={() => setAt(at + 1)} />
    </section>
  );
};
