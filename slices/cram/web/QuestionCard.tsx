import { useRef, useState } from "react";
import { Button, Card, Input, KanaInput } from "@mojibun/ui";
import type { FacetName, Question, Verdict } from "../contract.ts";
import { checkLocally, retryMessage, revealedAnswer, type Inputs } from "./check.ts";
import type { CramClient } from "./client.ts";

type Attempt = { facet: FacetName; input: string };
type Graded = Extract<Verdict, { status: "graded" }>;

const FacetInput = ({ facet, label, value, disabled, onChange }: { facet: FacetName; label: string; value: string; disabled: boolean; onChange: (value: string) => void }) => {
  const props = { "aria-label": label, value, disabled, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return <p>{facet === "meaning" ? <Input {...props} /> : <KanaInput ime="hiragana" {...props} />}</p>;
};

const Feedback = ({ question, verdict, onNext }: { question: Question; verdict: Graded; onNext: () => void }) => (
  <div role="status">
    <p>{verdict.passed ? "Right." : "Not quite."}</p>
    {verdict.results.map((r) => {
      const facet = question.facets.find((f) => f.facet === r.facet)!;
      return (
        <p key={r.facet}>
          {r.outcome === "pass" ? "✓" : "✗"} {r.message ?? (r.outcome === "fail" ? `Answer: ${revealedAnswer(facet.answerData)}` : "")}
        </p>
      );
    })}
    <Button variant="primary" onClick={onNext}>
      Next
    </Button>
  </div>
);

/** One Example, its facets, and the feedback after the Learner answers. */
export const QuestionCard = ({ question, client, onNext }: { question: Question; client: CramClient; onNext: (passed: boolean) => void }) => {
  const [inputs, setInputs] = useState<Inputs>({});
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [hintOpen, setHintOpen] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Graded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const typed = question.facets.map(({ facet }) => ({ facet, input: inputs[facet] ?? "" }));

  const send = async (revealed: boolean) => {
    const result = await client.submit({
      studyItemId: question.studyItemId,
      exampleId: question.exampleId,
      facets: typed,
      attempts,
      hintsOpened: hintOpen ? ["hint"] : [],
      revealed,
      timeToAnswerMs: Date.now() - startedAt.current,
    });
    if (!result.ok) return setError(result.message);
    setError(null);
    if (result.data.status === "graded") setVerdict(result.data);
    else setNudge(retryMessage(result.data.results));
  };

  const check = async () => {
    const message = retryMessage(checkLocally(question.facets, inputs));
    if (message === null) return send(false);
    setNudge(message);
    setAttempts((tries) => [...tries, ...typed]);
  };

  const { before, target, after, mode } = question.sentence;
  return (
    <Card>
      <p lang="ja" className="jp" style={{ fontSize: "1.5rem" }}>
        {before}
        {mode === "highlight" ? <mark>{target}</mark> : <span aria-label="blank">＿＿＿</span>}
        {after}
      </p>
      {question.translationEn && <p className="muted">{question.translationEn}</p>}
      {hintOpen && question.hint && <p>Hint: {question.hint}</p>}
      {question.facets.map(({ facet, label }) => (
        <FacetInput
          key={facet}
          facet={facet}
          label={label}
          value={inputs[facet] ?? ""}
          disabled={verdict !== null}
          onChange={(value) => setInputs((now) => ({ ...now, [facet]: value }))}
        />
      ))}
      {error && <p role="alert">{error}</p>}
      {verdict ? (
        <Feedback question={question} verdict={verdict} onNext={() => onNext(verdict.passed)} />
      ) : (
        <>
          {nudge && <p role="status">{nudge}</p>}
          <p>
            <Button variant="primary" onClick={check}>
              Check
            </Button>{" "}
            {question.hint && !hintOpen && <Button onClick={() => setHintOpen(true)}>Hint</Button>}{" "}
            <Button onClick={() => send(true)}>Show answer</Button>
          </p>
        </>
      )}
    </Card>
  );
};
