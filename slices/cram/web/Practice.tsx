import { useEffect, useState } from "react";
import type { StudyItemId } from "@ibbun/shared";
import { Button, State } from "@ibbun/ui";
import type { Question } from "../contract.ts";
import type { CramClient } from "./client.ts";
import { QuestionCard } from "./QuestionCard.tsx";

const Summary = ({ right, asked, skipped, onDone }: { right: number; asked: number; skipped: string[]; onDone: () => void }) => {
  const note = skipped.length > 0 && `No Example to practise yet for ${skipped.join(", ")}.`;
  const again = (label: string) => (
    <Button variant="primary" hotkey="Enter" onClick={onDone}>
      {label}
    </Button>
  );
  if (asked === 0)
    return (
      <State heading={1} mark="詰" label="Practice over" title="Nothing to practise" fact="None of these has an Example yet, so there was nothing to ask." note={note}>
        {again("Choose others")}
      </State>
    );
  return (
    <State heading={1} score={{ right, of: asked }} label="Practice over" title="Done" fact={`${right} of ${asked} right. Mastery and statistics are unchanged.`} note={note}>
      {again("Choose more")}
    </State>
  );
};

/** What Practice needs of a Study Item: its id to ask with, and a label to name it when it has no Example. */
export type PracticeItem = { id: StudyItemId; label: string };

/** Works through the chosen Study Items in order, one question each, then shows how it went. */
export const Practice = ({ items, client, onDone }: { items: PracticeItem[]; client: CramClient; onDone: () => void }) => {
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
