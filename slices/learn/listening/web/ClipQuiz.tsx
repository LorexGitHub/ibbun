import { useRef, useState } from "react";
import { Button, KanaInput, Pill } from "@ibbun/ui";
import type { ClipAnswer, ClipLesson, ClipVerdict } from "../contract.ts";
import { ClipPlayer } from "./LessonPlayer.tsx";

type Try = Pick<ClipAnswer, "input" | "attempts" | "replays" | "slow" | "timeToAnswerMs">;

const Answer = ({ question, onSubmit }: { question: ClipLesson["question"]; onSubmit: (value: string) => void }) => {
  const [typed, setTyped] = useState("");
  if (question.kind === "dictation") {
    return (
      <form onSubmit={(e) => (e.preventDefault(), onSubmit(typed))}>
        <KanaInput ime="hiragana" autoFocus aria-label="What did you hear?" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <Button type="submit" variant="primary" hotkey="Enter">
          Check
        </Button>
      </form>
    );
  }
  return (
    <fieldset>
      <legend lang="ja">{question.prompt}</legend>
      {question.choices.map((choice, i) => (
        <Button key={choice} hotkey={String(i + 1)} onClick={() => onSubmit(choice)}>
          <span lang="ja">{choice}</span>
        </Button>
      ))}
    </fieldset>
  );
};

/** One go at the quiz: a fresh play, then the question. Exam Mode plays once and shows the question first. */
const Go = ({ clip, onAnswer }: { clip: ClipLesson; onAnswer: (t: Try) => Promise<void> }) => {
  const [plays, setPlays] = useState(0);
  const slowUsed = useRef(false);
  const startedAt = useRef(Date.now());
  const asking = clip.examMode || plays > 0;
  return (
    <>
      <ClipPlayer audio={clip.lines} once={clip.examMode} slowAudio={clip.slowAudio} onPlay={(slow) => (setPlays((n) => n + 1), (slowUsed.current ||= slow))} />
      {asking && (
        <Answer
          question={clip.question}
          onSubmit={(input) =>
            void onAnswer({ input, attempts: [], replays: Math.max(0, plays - 1), slow: slowUsed.current, timeToAnswerMs: Date.now() - startedAt.current })
          }
        />
      )}
    </>
  );
};

/** The quiz step: the clip's Example on a fresh play. A miss shows the answer, then asks again on another fresh play. */
export const ClipQuiz = ({ clip, check, onPassed }: { clip: ClipLesson; check: (a: ClipAnswer) => Promise<ClipVerdict>; onPassed: () => void }) => {
  const [missed, setMissed] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<ClipVerdict | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const answer = async (t: Try) => {
    const v = await check({ ...t, studyItemId: clip.studyItemId, exampleId: clip.exampleId, attempts: missed }).catch((e: Error) => e);
    if (v instanceof Error) return setFailed(v.message);
    if (v.outcome === "pass") return onPassed();
    setMissed([...missed, t.input]);
    setVerdict(v);
  };

  if (verdict?.outcome === "fail") {
    return (
      <div>
        <Pill>Not quite</Pill>
        {verdict.correctChoice && (
          <p>
            Answer: <span lang="ja">{verdict.correctChoice}</span>
          </p>
        )}
        <Button variant="primary" hotkey="Enter" onClick={() => setVerdict(null)}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div>
      {failed && <p role="alert">{failed}</p>}
      {verdict && <p role="status">type an answer first</p>}
      <Go clip={clip} onAnswer={answer} />
    </div>
  );
};
