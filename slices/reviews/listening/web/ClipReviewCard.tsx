import { useRef, useState } from "react";
import { AudioPlayer, Button, Card, KanaInput, Pill } from "@mojibun/ui";
import type { ClipAnswerResponse, ClipReview } from "../contract.ts";
import type { AnswerClip } from "./clip-reviews-client.ts";
import { ClipReviewPlayer } from "./ClipReviewPlayer.tsx";
import { DictationDiff } from "./DictationDiff.tsx";

type Done = Exclude<ClipAnswerResponse, { outcome: "retry" }>;

/** The Learner's answer to the question: typed Japanese, or the text of the option picked. */
const Answer = ({ question, onSubmit }: { question: ClipReview["question"]; onSubmit: (value: string) => void }) => {
  const [typed, setTyped] = useState("");
  if (question.kind === "dictation") {
    return (
      <form onSubmit={(e) => (e.preventDefault(), onSubmit(typed))}>
        <KanaInput ime="hiragana" aria-label="What did you hear?" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <Button type="submit" variant="primary">
          Check
        </Button>
      </form>
    );
  }
  return (
    <fieldset>
      <legend lang="ja">{question.prompt}</legend>
      {question.choices.map((choice) => (
        <Button key={choice} onClick={() => onSubmit(choice)}>
          <span lang="ja">{choice}</span>
        </Button>
      ))}
    </fieldset>
  );
};

/** After answering: the verdict, the diff of a failed dictation, then the transcript (text stays hidden until now). */
const Result = ({ done, onNext }: { done: Done; onNext: () => void }) => (
  <Card>
    <Pill ink={done.outcome === "pass"}>{done.outcome === "pass" ? "Correct" : "Not quite"}</Pill>
    {done.correctChoice && (
      <p>
        Answer: <span lang="ja">{done.correctChoice}</span>
      </p>
    )}
    {done.diff && <DictationDiff diff={done.diff} extra={done.extra} />}
    <ol aria-label="Transcript">
      {done.transcript.map((line, i) => (
        <li key={i}>
          {line.speaker && <b lang="ja">{line.speaker} </b>}
          <span lang="ja">{line.text}</span>
          {line.translation && (
            <details>
              <summary>Translation</summary>
              {line.translation}
            </details>
          )}
          {line.audio && <AudioPlayer src={line.audio} label={`line ${i + 1}`} />}
        </li>
      ))}
    </ol>
    <Button variant="primary" onClick={onNext}>
      Next
    </Button>
  </Card>
);

/**
 * One scheduled clip: hear it, answer, then read the transcript. Exam Mode shows the question before the
 * audio, which plays once. Otherwise the question appears after the first play.
 */
export const ClipReviewCard = ({ review, answer, onDone }: { review: ClipReview; answer: AnswerClip; onDone: () => void }) => {
  const [plays, setPlays] = useState(0);
  const slowUsed = useRef(false);
  const startedAt = useRef(Date.now());
  const [attempts, setAttempts] = useState<string[]>([]);
  const [done, setDone] = useState<Done | null>(null);

  const submit = async (value: string, revealed = false) => {
    const response = await answer({
      clipId: review.clipId,
      exampleId: review.exampleId,
      input: value,
      attempts,
      replays: Math.max(0, plays - 1),
      slow: slowUsed.current,
      revealed,
      timeToAnswerMs: Date.now() - startedAt.current,
    });
    if (response.outcome !== "retry") return setDone(response);
    setAttempts([...attempts, value]);
  };

  if (done) return <Result done={done} onNext={onDone} />;
  const asking = review.examMode || plays > 0;
  return (
    <Card>
      <ClipReviewPlayer
        audio={review.audio}
        examMode={review.examMode}
        slowAudio={review.slowAudio}
        onPlay={(slow) => (setPlays((n) => n + 1), (slowUsed.current ||= slow))}
      />
      {asking && <Answer key={attempts.length} question={review.question} onSubmit={submit} />}
      <Button onClick={() => submit("", true)}>Show answer</Button>
    </Card>
  );
};
