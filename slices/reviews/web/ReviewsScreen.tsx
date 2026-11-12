import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Card, levelQuery, useLevelFilter } from "@mojibun/ui";
import { StudyItemId, type JlptLevel } from "@mojibun/shared";
import { DueResponse, SubmitResponse, type AnswerKind, type ReviewPrompt, type SubmitRequest } from "../contract.ts";
import { loadDueClips, type LoadClips } from "../listening/web/clip-reviews-client.ts";
import { ListeningReviews } from "../listening/web/ListeningReviews.tsx";
import { WrapUp, type LoadWrapUp, type Miss } from "../wrap-up/WrapUp.tsx";
import { clearUntil, doorsAfter, tallied, type Tally } from "./ending.ts";
import { call, postJson, useLoaded } from "./http.ts";
import type { Submit } from "./ReviewCard.tsx";
import { Run } from "./Run.tsx";
import "./reviews.css";

export const loadDue = async (level?: JlptLevel): Promise<DueResponse> => DueResponse.parse(await call(`/due${levelQuery(level)}`));

export const loadGhosts = async (): Promise<DueResponse> => DueResponse.parse(await call("/ghosts"));

export const loadWrapUp: LoadWrapUp = async (studyItemId, asked) =>
  DueResponse.parse(await call(`/wrap-up/${studyItemId}?${new URLSearchParams(asked.map((a) => ["asked", a]))}`));

export const submitAnswer: Submit = async (request: SubmitRequest) =>
  SubmitResponse.parse(await postJson("/answer", request));

/** The same submit, recording every answer as this kind of Review. */
const asKind = (submit: Submit, kind: AnswerKind): Submit => (request) => submit({ ...request, kind });

type Phase = "reviews" | "listening" | "wrap-up" | "ghosts" | "done";

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

/** The end of the screen: one line of fact, then three doors. A session that asked nothing says until when it is clear. */
const Ending = ({ tally, lapses, nextDue }: { tally: Tally; lapses: string[]; nextDue: DueResponse["nextDue"] }) => {
  const fact = tally.done ? `${tally.done} done, ${tally.right} right` : clearUntil(nextDue, new Date());
  return (
    <section className="ending">
      <h2>{tally.done ? "Session complete." : "No Reviews are due."}</h2>
      {fact && <p className="ending-fact">{fact}</p>}
      <nav aria-label="Where next" className="doors">
        {doorsAfter(lapses).map((door) => (
          <a key={door.href} className="door" href={door.href}>
            <strong>{door.label}</strong>
            <span>{door.note}</span>
          </a>
        ))}
      </nav>
    </section>
  );
};

type Loaders = {
  load?: (level?: JlptLevel) => Promise<DueResponse>;
  submit?: Submit;
  wrapUp?: LoadWrapUp;
  ghosts?: () => Promise<DueResponse>;
  clips?: LoadClips;
};

const LIVE = { load: loadDue, submit: submitAnswer, wrapUp: loadWrapUp, ghosts: loadGhosts, clips: loadDueClips };

const missOf = (prompt: ReviewPrompt): Miss => ({ studyItemId: StudyItemId.parse(prompt.studyItemId), asked: [prompt.exampleId] });

/** The review session at the level the Level filter names. Another level is another session, started from its beginning. */
export const ReviewsScreen = (props: Loaders) => {
  const level = useLevelFilter();
  return <Session key={level ?? "all"} level={level} {...props} />;
};

/** Due Reviews, then the due Listening Clips, then a Wrap-Up of every miss, then any Ghosts. */
const Session = ({ level, ...props }: Loaders & { level: JlptLevel | undefined }) => {
  const loaders = { ...LIVE, ...props };
  const load = useCallback(() => loaders.load(level), [loaders.load, level]);
  const clips = useCallback(() => loaders.clips(level), [loaders.clips, level]);
  const { data: due, failed } = useLoaded(load);
  const [phase, setPhase] = useState<Phase>("reviews");
  const [misses, setMisses] = useState<Miss[]>([]);
  const [tally, setTally] = useState<Tally>({ done: 0, right: 0 });

  if (failed) return <p role="alert">{failed}</p>;
  if (!due) return <p>Loading…</p>;
  const next = (to: Phase) => () => setPhase(to);
  const none = due.reviews.length === 0;
  const at = phase === "reviews" && none ? "listening" : phase;
  const steps: Record<Phase, ReactNode> = {
    reviews: (
      <Run
        prompts={due.reviews}
        preferences={due.preferences}
        submit={asKind(loaders.submit, "srs")}
        onResult={(prompt, result) => {
          setTally((now) => tallied(now, result.passed));
          if (!result.passed) setMisses((now) => [...now, missOf(prompt)]);
        }}
        onFinish={next("listening")}
      />
    ),
    listening: <ListeningReviews load={clips} onFinish={next("wrap-up")} />,
    "wrap-up": <WrapUp misses={misses} load={loaders.wrapUp} submit={asKind(loaders.submit, "wrap-up")} onFinish={next("ghosts")} />,
    ghosts: <Ghosts load={loaders.ghosts} submit={loaders.submit} onFinish={next("done")} />,
    done: <Ending tally={tally} lapses={misses.map((m) => m.studyItemId)} nextDue={due.nextDue} />,
  };
  return (
    <section>
      <h1>Reviews</h1>
      {steps[at]}
    </section>
  );
};
