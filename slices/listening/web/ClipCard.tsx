import { useRef, useState } from "react";
import { AudioPlayer, Button, Card, Pill } from "@ibbun/ui";
import type { AnswerResponse, ClipView } from "../contract.ts";
import { answerClip } from "./api.ts";
import { ClipPlayer } from "./ClipPlayer.tsx";
import "./listening.css";

type Done = Exclude<AnswerResponse, { outcome: "retry" }>;

/** The question and its options. An option is picked by pressing it or by its number key, 1 to 4. */
const Choices = ({ question, onPick }: { question: ClipView["question"]; onPick: (choice: string) => void }) => (
  <fieldset className="clip-question">
    <legend lang="ja">{question.prompt}</legend>
    <ol>
      {question.choices.map((choice, i) => (
        <li key={choice}>
          <Button hotkey={String(i + 1)} onClick={() => onPick(choice)}>
            <span lang="ja">{choice}</span>
          </Button>
        </li>
      ))}
    </ol>
  </fieldset>
);

const Result = ({ done, nextLabel, onNext }: { done: Done; nextLabel: string; onNext: () => void }) => (
  <Card>
    <Pill ink={done.outcome === "pass"}>{done.outcome === "pass" ? "Correct" : "Not quite"}</Pill>
    <p>
      Answer: <span lang="ja">{done.correctChoice}</span>
    </p>
    <ol className="clip-transcript">
      {done.transcript.map((line, i) => (
        <li key={i}>
          {line.speaker && <b lang="ja">{line.speaker} </b>}
          <span lang="ja">{line.text}</span>
          {line.translation && <details><summary>Translation</summary>{line.translation}</details>}
          {line.audio && <AudioPlayer src={line.audio} label={`line ${i + 1}`} />}
        </li>
      ))}
    </ol>
    <Button variant="primary" hotkey="Enter" onClick={onNext}>
      {nextLabel}
    </Button>
  </Card>
);

type Props = {
  view: ClipView;
  onNext: () => void;
  /** Where the answer goes: free practice by default, a Practice Text's own route otherwise. */
  answerWith?: typeof answerClip;
  nextLabel?: string;
};

/** One clip: the player is the screen, the question sits under it, and the text shows only once the Learner has answered. */
export const ClipCard = ({ view, onNext, answerWith = answerClip, nextLabel = "Next clip" }: Props) => {
  const [plays, setPlays] = useState(0);
  const slowUsed = useRef(false);
  const startedAt = useRef(Date.now());
  const sending = useRef(false);
  const [attempts, setAttempts] = useState<string[]>([]);
  const [done, setDone] = useState<Done | null>(null);

  const submit = async (value: string, revealed = false) => {
    // An option pressed twice before the server has replied is one answer.
    if (sending.current) return;
    sending.current = true;
    const answer = await answerWith(view.clipId, {
      exampleId: view.exampleId,
      input: value,
      attempts,
      replays: Math.max(0, plays - 1),
      slow: slowUsed.current,
      revealed,
      timeToAnswerMs: Date.now() - startedAt.current,
    });
    sending.current = false;
    if (answer.outcome !== "retry") return setDone(answer);
    setAttempts([...attempts, value]);
  };

  if (done) return <Result done={done} nextLabel={nextLabel} onNext={onNext} />;
  const asking = view.examMode || plays > 0;
  return (
    <div className="clip">
      <ClipPlayer
        audio={view.audio}
        examMode={view.examMode}
        slowAudio={view.slowAudio}
        onPlay={(slow) => (setPlays((n) => n + 1), (slowUsed.current ||= slow))}
      />
      {asking && <Choices question={view.question} onPick={submit} />}
      <Button onClick={() => submit("", true)}>Show answer</Button>
    </div>
  );
};
