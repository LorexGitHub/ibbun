import { useState } from "react";
import { Button, Card } from "@mojibun/ui";
import type { ClipAnswer, ClipLesson, ClipVerdict } from "../contract.ts";
import { ClipPlayer } from "./LessonPlayer.tsx";
import { ClipQuiz } from "./ClipQuiz.tsx";

type Step = "listen" | "read" | "quiz";

const Read = ({ clip, onNext }: { clip: ClipLesson; onNext: () => void }) => (
  <>
    <ol>
      {clip.lines.map((line, i) => (
        <li key={i}>
          {line.speaker && <b lang="ja">{line.speaker} </b>}
          <span className="jp" lang="ja">
            {line.text}
          </span>
          {line.translationEn && (
            <details>
              <summary>Translation</summary>
              {line.translationEn}
            </details>
          )}
        </li>
      ))}
    </ol>
    {clip.links.length > 0 && (
      <p>
        Words and grammar:{" "}
        {clip.links.map((l) => (
          <a key={l.studyItemId} href={`/browse/items/${l.studyItemId}`} lang="ja">
            {l.label}{" "}
          </a>
        ))}
      </p>
    )}
    <Button variant="primary" hotkey="Enter" onClick={onNext}>
      Start quiz
    </Button>
  </>
);

/**
 * A Listening Clip's lesson: Listen, Read, Quiz (listening.md#learn). Listen and Read always allow replay and
 * slow speed, whatever Exam Mode says; only the quiz honours it.
 */
export const ClipLessonCard = ({ clip, check, onPassed }: { clip: ClipLesson; check: (a: ClipAnswer) => Promise<ClipVerdict>; onPassed: () => void }) => {
  const [step, setStep] = useState<Step>("listen");
  return (
    <Card>
      <h2>Listening clip: {step === "listen" ? "Listen" : step === "read" ? "Read" : "Quiz"}</h2>
      {step === "listen" && (
        <>
          <ClipPlayer audio={clip.lines} once={false} slowAudio={clip.slowAudio} onPlay={() => undefined} />
          <Button variant="primary" hotkey="Enter" onClick={() => setStep("read")}>
            Read it
          </Button>
        </>
      )}
      {step === "read" && <Read clip={clip} onNext={() => setStep("quiz")} />}
      {step === "quiz" && <ClipQuiz clip={clip} check={check} onPassed={onPassed} />}
    </Card>
  );
};
