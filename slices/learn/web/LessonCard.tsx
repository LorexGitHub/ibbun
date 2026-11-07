import { Button, Card } from "@mojibun/ui";
import type { Lesson } from "../contract.ts";

/** What Learn teaches about one Study Item, with "I know this" to skip it. */
export const LessonCard = ({ lesson, last, onNext, onKnown }: { lesson: Lesson; last: boolean; onNext: () => void; onKnown: () => void }) => (
  <Card>
    <h2 className="jp" lang="ja">
      {lesson.title}
    </h2>
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
    <p className="jp" lang="ja">
      {lesson.example.japanese}
    </p>
    {lesson.example.translationEn && <p lang="en">{lesson.example.translationEn}</p>}
    <Button variant="primary" onClick={onNext}>
      {last ? "Start quiz" : "Next"}
    </Button>
    <Button onClick={onKnown}>I know this</Button>
  </Card>
);
