import { useEffect, useState } from "react";
import { Card } from "@mojibun/ui";
import { StudyItemId } from "@mojibun/shared";
import { DueResponse, SubmitResponse, type AnswerKind, type ReviewPrompt, type SubmitRequest } from "../contract.ts";
import { WrapUp, type LoadWrapUp, type Miss } from "../wrap-up/WrapUp.tsx";
import type { Submit } from "./ReviewCard.tsx";
import { Run } from "./Run.tsx";

const BASE = "/api/reviews";

const call = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${BASE}${path}`, { credentials: "same-origin", ...init });
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? response.statusText);
  return response.json();
};

export const loadDue = async (): Promise<DueResponse> => DueResponse.parse(await call("/due"));

export const loadGhosts = async (): Promise<DueResponse> => DueResponse.parse(await call("/ghosts"));

export const loadWrapUp: LoadWrapUp = async (studyItemId, asked) =>
  DueResponse.parse(await call(`/wrap-up/${studyItemId}?${new URLSearchParams(asked.map((a) => ["asked", a]))}`));

export const submitAnswer: Submit = async (request: SubmitRequest) =>
  SubmitResponse.parse(
    await call("/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }),
  );

/** The same submit, recording every answer as this kind of Review. */
const asKind = (submit: Submit, kind: AnswerKind): Submit => (request) => submit({ ...request, kind });

type Phase = "reviews" | "wrap-up" | "ghosts" | "done";

/** Ghosts: the exact Examples missed in an earlier session, asked once more. They never change Mastery. */
const Ghosts = ({ load, submit, onFinish }: { load: () => Promise<DueResponse>; submit: Submit; onFinish: () => void }) => {
  const [ghosts, setGhosts] = useState<DueResponse | null>(null);
  useEffect(() => {
    load().then(
      (loaded) => (loaded.reviews.length ? setGhosts(loaded) : onFinish()),
      () => onFinish(),
    );
  }, [load]);
  if (!ghosts) return null;
  return (
    <section aria-label="Ghosts">
      <h2>Ghosts</h2>
      <Card>Missed in an earlier session. These do not change your Mastery.</Card>
      <Run prompts={ghosts.reviews} preferences={ghosts.preferences} submit={asKind(submit, "ghost")} onFinish={onFinish} />
    </section>
  );
};

type Loaders = { load?: () => Promise<DueResponse>; submit?: Submit; wrapUp?: LoadWrapUp; ghosts?: () => Promise<DueResponse> };

const LIVE = { load: loadDue, submit: submitAnswer, wrapUp: loadWrapUp, ghosts: loadGhosts };

/** The due Reviews, or why they could not be loaded. */
const useDue = (load: () => Promise<DueResponse>) => {
  const [due, setDue] = useState<DueResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    load().then(setDue, (e: Error) => setFailed(e.message));
  }, [load]);
  return { due, failed };
};

const missOf = (prompt: ReviewPrompt): Miss => ({ studyItemId: StudyItemId.parse(prompt.studyItemId), asked: [prompt.exampleId] });

/** The scheduled Reviews. With none due, Ghosts are the only thing left to offer. */
const Scheduled = (props: { due: DueResponse; loaders: Required<Loaders>; onMiss: (miss: Miss) => void; onFinish: (to: Phase) => void }) => {
  const { due, loaders, onMiss, onFinish } = props;
  const none = due.reviews.length === 0;
  return (
    <>
      {none && <Card>No Reviews are due. Come back later.</Card>}
      <Run
        prompts={due.reviews}
        preferences={due.preferences}
        submit={asKind(loaders.submit, "srs")}
        onResult={(prompt, result) => result.passed || onMiss(missOf(prompt))}
        onFinish={() => onFinish("wrap-up")}
      />
      {none && <Ghosts load={loaders.ghosts} submit={loaders.submit} onFinish={() => onFinish("done")} />}
    </>
  );
};

/** The review session: due Reviews, then a Wrap-Up of every miss, then any Ghosts. */
export const ReviewsScreen = (props: Loaders) => {
  const loaders = { ...LIVE, ...props };
  const { due, failed } = useDue(loaders.load);
  const [phase, setPhase] = useState<Phase>("reviews");
  const [misses, setMisses] = useState<Miss[]>([]);

  if (failed) return <p role="alert">{failed}</p>;
  if (!due) return <p>Loading…</p>;
  const next = (to: Phase) => () => setPhase(to);
  return (
    <section>
      <h1>Reviews</h1>
      {phase === "reviews" && <Scheduled due={due} loaders={loaders} onMiss={(miss) => setMisses((now) => [...now, miss])} onFinish={setPhase} />}
      {phase === "wrap-up" && <WrapUp misses={misses} load={loaders.wrapUp} submit={asKind(loaders.submit, "wrap-up")} onFinish={next("ghosts")} />}
      {phase === "ghosts" && <Ghosts load={loaders.ghosts} submit={loaders.submit} onFinish={next("done")} />}
      {phase === "done" && <Card>Session complete.</Card>}
    </section>
  );
};
