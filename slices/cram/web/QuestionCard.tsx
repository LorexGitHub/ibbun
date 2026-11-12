import { useRef, useState } from "react";
import { Button, Card, Input, KanaInput } from "@mojibun/ui";
import type { FacetName, Question, Verdict } from "../contract.ts";
import { checkLocally, retryMessage, revealedAnswer, type Inputs } from "./check.ts";
import type { CramClient } from "./client.ts";

type Attempt = { facet: FacetName; input: string };
type Graded = Extract<Verdict, { status: "graded" }>;

type FacetInputProps = { facet: FacetName; label: string; value: string; disabled: boolean; autoFocus: boolean; onChange: (value: string) => void };

const FacetInput = ({ facet, label, value, disabled, autoFocus, onChange }: FacetInputProps) => {
  const props = { "aria-label": label, value, disabled, autoFocus, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
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
    <Button variant="primary" hotkey="Enter" onClick={onNext}>
      Next
    </Button>
  </div>
);

const Prompt = ({ question, hintOpen }: { question: Question; hintOpen: boolean }) => {
  const { before, target, after, mode } = question.sentence;
  return (
    <>
      <p lang="ja" className="jp" style={{ fontSize: "1.5rem" }}>
        {before}
        {mode === "highlight" ? <mark>{target}</mark> : <span aria-label="blank">＿＿＿</span>}
        {after}
      </p>
      {question.translationEn && <p className="muted">{question.translationEn}</p>}
      {hintOpen && question.hint && <p>Hint: {question.hint}</p>}
    </>
  );
};

type Actions = { check: () => void; reveal: () => void; openHint?: () => void };

const Controls = ({ check, reveal, openHint }: Actions) => (
  <p>
    <Button variant="primary" hotkey="Enter" onClick={check}>
      Check
    </Button>{" "}
    {openHint && <Button onClick={openHint}>Hint</Button>} <Button onClick={reveal}>Show answer</Button>
  </p>
);

/** The Learner's typing, tries and hints for one question, and how they are sent. */
const useAnswering = (question: Question, client: CramClient) => {
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

  return {
    inputs,
    hintOpen,
    nudge,
    verdict,
    error,
    type: (facet: FacetName, value: string) => setInputs((now) => ({ ...now, [facet]: value })),
    actions: { check, reveal: () => send(true), openHint: question.hint && !hintOpen ? () => setHintOpen(true) : undefined },
  };
};

/** One Example, its facets, and the feedback after the Learner answers. */
export const QuestionCard = ({ question, client, onNext }: { question: Question; client: CramClient; onNext: (passed: boolean) => void }) => {
  const a = useAnswering(question, client);
  return (
    <Card>
      <Prompt question={question} hintOpen={a.hintOpen} />
      {question.facets.map(({ facet, label }, i) => (
        <FacetInput key={facet} autoFocus={i === 0} facet={facet} label={label} value={a.inputs[facet] ?? ""} disabled={a.verdict !== null} onChange={(value) => a.type(facet, value)} />
      ))}
      {a.error && <p role="alert">{a.error}</p>}
      {a.verdict ? (
        <Feedback question={question} verdict={a.verdict} onNext={() => onNext(a.verdict!.passed)} />
      ) : (
        <>
          {a.nudge && <p role="status">{a.nudge}</p>}
          <Controls {...a.actions} />
        </>
      )}
    </Card>
  );
};
