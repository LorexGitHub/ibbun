import { useState } from "react";
import { Button, Card, Furigana } from "@mojibun/ui";
import type { Lesson, QuizPrompt } from "../contract.ts";
import { readingIn } from "./batch-view.ts";

type Said = "known" | "not yet";

/** The Example with the Study Item marked in it. Its reading shows once the card is turned. */
const InSentence = ({ prompt, turned }: { prompt: QuizPrompt; turned: Said | null }) => {
  const { before, target, after } = prompt.sentence;
  const reading = turned ? readingIn(prompt) : undefined;
  return (
    <>
      {before}
      <mark>{reading ? <Furigana segments={[{ text: target, reading }]} /> : target}</mark>
      {after}
    </>
  );
};

const Facts = ({ lesson }: { lesson: Lesson }) => (
  <>
    {lesson.reading && (
      <p className="jp" lang="ja">
        {lesson.reading}
      </p>
    )}
    <ul>
      {lesson.meanings.map((m) => (
        <li key={m} lang="en">
          {m}
        </li>
      ))}
    </ul>
    <dl>
      {lesson.details.map((d) => (
        <div key={d.label}>
          <dt>{d.label}</dt>
          <dd>{d.value}</dd>
        </div>
      ))}
    </dl>
    {lesson.japaneseExplanation && (
      <p lang="ja" className="jp">
        {lesson.japaneseExplanation}
      </p>
    )}
  </>
);

const Example = ({ lesson }: { lesson: Lesson }) => (
  <>
    <p className="jp" lang="ja">
      {lesson.example.japanese}
    </p>
    {lesson.example.translationEn && <p lang="en">{lesson.example.translationEn}</p>}
  </>
);

/** The taught side. A card that led with the Example has shown it already, so it adds only the translation. */
const Back = ({ lesson, prompt, inSentence }: { lesson: Lesson; prompt: QuizPrompt; inSentence: boolean }) =>
  inSentence ? (
    <>
      {prompt.translationEn && <p lang="en">{prompt.translationEn}</p>}
      <Facts lesson={lesson} />
    </>
  ) : (
    <>
      <Facts lesson={lesson} />
      <Example lesson={lesson} />
    </>
  );

type Props = {
  lesson: Lesson;
  prompt: QuizPrompt;
  /** Show the item marked inside its Example first, instead of alone. */
  inSentence: boolean;
  last: boolean;
  onNext: () => void;
  onKnown: () => void;
};

/**
 * One Study Item as a card with two sides. The front asks whether the Learner knows it. The back teaches it and
 * says which way they answered. The answer changes nothing: only "Mark as Known" keeps the item out of the quiz.
 */
export const LessonCard = ({ lesson, prompt, inSentence, last, onNext, onKnown }: Props) => {
  const [said, setSaid] = useState<Said | null>(null);
  return (
    <Card className="lesson-card">
      <h2 className={inSentence ? "jp in-sentence" : "jp"} lang="ja">
        {inSentence ? <InSentence prompt={prompt} turned={said} /> : lesson.title}
      </h2>
      {said ? (
        <>
          <p className="muted small">You said: {said === "known" ? "I know this" : "not yet"}</p>
          <Back lesson={lesson} prompt={prompt} inSentence={inSentence} />
          <div className="lesson-actions">
            <Button onClick={onKnown}>Mark as Known</Button>
            <Button variant="primary" hotkey="Enter" onClick={onNext}>
              {last ? "Start quiz" : "Next"}
            </Button>
          </div>
        </>
      ) : (
        <div className="lesson-actions">
          <Button hotkey="1" onClick={() => setSaid("not yet")}>Not yet</Button>
          <Button variant="primary" hotkey="2" onClick={() => setSaid("known")}>
            I know this
          </Button>
        </div>
      )}
    </Card>
  );
};
