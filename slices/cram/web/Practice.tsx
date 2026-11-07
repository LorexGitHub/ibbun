import { useEffect, useState } from "react";
import type { StudyItemSummary } from "@mojibun/content-graph";
import { Button, Card } from "@mojibun/ui";
import type { Question } from "../contract.ts";
import type { CramClient } from "./client.ts";
import { QuestionCard } from "./QuestionCard.tsx";

const Summary = ({ right, asked, skipped, onDone }: { right: number; asked: number; skipped: string[]; onDone: () => void }) => (
  <Card>
    <h1>Done</h1>
    <p>
      {right} of {asked} right. Mastery and statistics are unchanged.
    </p>
    {skipped.length > 0 && <p className="muted">No Example to practise yet for {skipped.join(", ")}.</p>}
    <Button variant="primary" onClick={onDone}>
      Choose more
    </Button>
  </Card>
);

/** Works through the chosen Study Items in order, one question each, then shows how it went. */
export const Practice = ({ items, client, onDone }: { items: StudyItemSummary[]; client: CramClient; onDone: () => void }) => {
  const [at, setAt] = useState(0);
  const [right, setRight] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const item = items[at];

  useEffect(() => {
    setQuestion(null);
    if (!item) return;
    let current = true;
    client.question(item.id).then((result) => {
      if (!current) return;
      if (result.ok) return setQuestion(result.data);
      setSkipped((now) => [...now, item.label]);
      setAt((n) => n + 1);
    });
    return () => void (current = false);
  }, [at, items]);

  if (!item) return <Summary right={right} asked={items.length - skipped.length} skipped={skipped} onDone={onDone} />;
  return (
    <>
      <p className="muted">
        {at + 1} of {items.length}
      </p>
      {question ? (
        <QuestionCard
          key={`${at}:${question.exampleId}`}
          question={question}
          client={client}
          onNext={(passed) => {
            setRight((n) => n + Number(passed));
            setAt((n) => n + 1);
          }}
        />
      ) : (
        <p role="status">Loading…</p>
      )}
    </>
  );
};
