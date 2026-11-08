import { useEffect, useState } from "react";
import { Card } from "@mojibun/ui";
import { DueResponse, SubmitResponse, type SubmitRequest } from "../contract.ts";
import type { Flag } from "../flags/web.tsx";
import { ReviewCard, type Submit } from "./ReviewCard.tsx";

const BASE = "/api/reviews";

const call = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${BASE}${path}`, { credentials: "same-origin", ...init });
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? response.statusText);
  return response.json();
};

export const loadDue = async (): Promise<DueResponse> => DueResponse.parse(await call("/due"));

export const submitAnswer: Submit = async (request: SubmitRequest) =>
  SubmitResponse.parse(
    await call("/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }),
  );

export const flagAnswer: Flag = async (request) => {
  await call("/flag", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
};

/** The review session: due Reviews one after another. */
export const ReviewsScreen = ({ load = loadDue, submit = submitAnswer, flag = flagAnswer }: { load?: () => Promise<DueResponse>; submit?: Submit; flag?: Flag }) => {
  const [due, setDue] = useState<DueResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    load().then(setDue, (e: Error) => setFailed(e.message));
  }, [load]);

  if (failed) return <p role="alert">{failed}</p>;
  if (!due) return <p>Loading…</p>;
  const prompt = due.reviews[at];
  if (!prompt) return <Card>No Reviews are due. Come back later.</Card>;
  return (
    <section>
      <h1>Reviews</h1>
      <p>
        {at + 1} of {due.reviews.length}
      </p>
      <ReviewCard key={prompt.exampleId + at} prompt={prompt} preferences={due.preferences} submit={submit} flag={flag} onDone={() => setAt(at + 1)} />
    </section>
  );
};
