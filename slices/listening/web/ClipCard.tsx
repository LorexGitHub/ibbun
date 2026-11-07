import { useRef, useState } from "react";
import { AudioPlayer, Button, Card, KanaInput, Pill } from "@mojibun/ui";
import type { AnswerResponse, ClipView } from "../contract.ts";
import { answerClip } from "./api.ts";
import { ClipPlayer } from "./ClipPlayer.tsx";

type Done = Exclude<AnswerResponse, { outcome: "retry" }>;

/** The Learner's answer to the question: typed Japanese, or the text of the option picked. */
const Answer = ({ question, onSubmit }: { question: ClipView["question"]; onSubmit: (value: string) => void }) => {
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

const Result = ({ done, onNext }: { done: Done; onNext: () => void }) => (
  <Card>
    <Pill ink={done.outcome === "pass"}>{done.outcome === "pass" ? "Correct" : "Not quite"}</Pill>
    {done.correctChoice && (
      <p>
        Answer: <span lang="ja">{done.correctChoice}</span>
      </p>
    )}
    <ol>
      {done.transcript.map((line, i) => (
        <li key={i}>
          {line.speaker && <b lang="ja">{line.speaker} </b>}
          <span lang="ja">{line.text}</span>
          {line.translation && <details><summary>Translation</summary>{line.translation}</details>}
          {line.audio && <AudioPlayer src={line.audio} label={`line ${i + 1}`} />}
        </li>
      ))}
    </ol>
    <Button variant="primary" onClick={onNext}>
      Next clip
    </Button>
  </Card>
);

/** One clip: hear it, answer, then read the transcript. Text stays hidden until the Learner has answered. */
export const ClipCard = ({ view, onNext }: { view: ClipView; onNext: () => void }) => {
  const [plays, setPlays] = useState(0);
  const slowUsed = useRef(false);
  const startedAt = useRef(Date.now());
  const [attempts, setAttempts] = useState<string[]>([]);
  const [done, setDone] = useState<Done | null>(null);

  const submit = async (value: string, revealed = false) => {
    const answer = await answerClip(view.clipId, {
      exampleId: view.exampleId,
      input: value,
      attempts,
      replays: Math.max(0, plays - 1),
      slow: slowUsed.current,
      revealed,
      timeToAnswerMs: Date.now() - startedAt.current,
    });
    if (answer.outcome !== "retry") return setDone(answer);
    setAttempts([...attempts, value]);
  };

  if (done) return <Result done={done} onNext={onNext} />;
  const asking = view.examMode || plays > 0;
  return (
    <Card>
      <ClipPlayer
        audio={view.audio}
        examMode={view.examMode}
        slowAudio={view.slowAudio}
        onPlay={(slow) => (setPlays((n) => n + 1), (slowUsed.current ||= slow))}
      />
      {asking && <Answer key={attempts.length} question={view.question} onSubmit={submit} />}
      <Button onClick={() => submit("", true)}>Show answer</Button>
    </Card>
  );
};
