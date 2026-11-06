import { useRef, useState, type FormEvent } from "react";
import { Button, Card, Input, KanaInput, Pill } from "@mojibun/ui";
import type { DueResponse, Facet, Hint, ReviewPrompt, SubmitRequest, SubmitResponse } from "../contract.ts";
import { acceptedOf, isJapanese, notAnswers, shownByDefault, type PromptFacet } from "./check.ts";

export type Submit = (request: SubmitRequest) => Promise<SubmitResponse>;
type Preferences = DueResponse["preferences"];
type Notes = Partial<Record<Facet, string>>;

const LABEL: Record<Facet, string> = { cloze: "Answer", reading: "Reading in this sentence", meaning: "Meaning of the kanji" };

const Sentence = ({ prompt, answered }: { prompt: ReviewPrompt; answered: boolean }) => {
  const { before, target, after } = prompt.sentence;
  const middle =
    prompt.mode === "highlight" ? <mark>{target}</mark> : answered ? <strong>{target}</strong> : <span aria-label="blank">＿＿＿</span>;
  return (
    <p className="jp" lang="ja">
      {before}
      {middle}
      {after}
    </p>
  );
};

const FacetInput = (props: {
  facet: PromptFacet;
  value: string;
  convertRomaji: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) => {
  const { facet, value, convertRomaji, disabled, onChange } = props;
  const common = { "aria-label": LABEL[facet.facet], value, disabled, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  if (!isJapanese(facet)) return <Input {...common} lang="en" />;
  return convertRomaji ? <KanaInput ime="hiragana" {...common} /> : <Input {...common} lang="ja" />;
};

const Info = ({ prompt, result }: { prompt: ReviewPrompt; result: SubmitResponse }) => (
  <div role="status">
    <p>
      <Pill ink={result.passed}>{result.passed ? "Correct" : "Not quite"}</Pill>
    </p>
    {result.facets.map((f) => (
      <p key={f.facet}>
        {LABEL[f.facet]}: {f.outcome === "pass" ? "correct" : "wrong"}
        {f.message ? ` — ${f.message}` : ""}
      </p>
    ))}
    {!result.passed && prompt.facets.map((f) => <p key={f.facet}>{acceptedOf(f).join(" / ")}</p>)}
    {prompt.translationEn && <p lang="en">{prompt.translationEn}</p>}
    {prompt.japaneseExplanation && (
      <p className="jp" lang="ja">
        {prompt.japaneseExplanation}
      </p>
    )}
  </div>
);

/** One Review. The first graded submission is final: there is no Undo. */
export const ReviewCard = (props: { prompt: ReviewPrompt; preferences: Preferences; submit: Submit; onDone: () => void }) => {
  const { prompt, preferences, submit, onDone } = props;
  const started = useRef(Date.now());
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const attempts = useRef<Partial<Record<Facet, string[]>>>({});
  const [notes, setNotes] = useState<Notes>({});
  const [opened, setOpened] = useState<Hint[]>([]);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = shownByDefault(preferences.explanations);
  const open = (hint: Hint) => setOpened((now) => (now.includes(hint) ? now : [...now, hint]));

  const send = async (revealed: boolean) => {
    setBusy(true);
    const facets = prompt.facets.map((f) => ({ facet: f.facet, input: inputs[f.facet] ?? "", attempts: attempts.current[f.facet] ?? [] }));
    const request = { studyItemId: prompt.studyItemId, exampleId: prompt.exampleId, facets, hintsOpened: opened, revealed, timeToAnswerMs: Date.now() - started.current };
    setResult(await submit(request));
  };

  const check = (event: FormEvent) => {
    event.preventDefault();
    const refused = notAnswers(prompt.facets, inputs, preferences.convertRomaji);
    if (refused.length === 0) return void send(false);
    // Not an answer, or an alternate's nudge: the try is kept in attempts[], never graded, and the field is cleared to try again.
    setNotes(Object.fromEntries(refused.map((r) => [r.facet, r.note])));
    for (const r of refused) attempts.current[r.facet] = [...(attempts.current[r.facet] ?? []), r.input];
    setInputs((now) => ({ ...now, ...Object.fromEntries(refused.map((r) => [r.facet, ""])) }));
  };

  const answered = result !== null;
  return (
    <Card>
      <form onSubmit={check}>
        <Sentence prompt={prompt} answered={answered} />
        {(shown.translation || opened.includes("translation")) && prompt.translationEn && <p lang="en">{prompt.translationEn}</p>}
        {(shown.explanation || opened.includes("explanation")) && prompt.japaneseExplanation && (
          <p className="jp" lang="ja">
            {prompt.japaneseExplanation}
          </p>
        )}
        {opened.includes("hint") && prompt.hint && <p lang="en">{prompt.hint}</p>}
        {prompt.facets.map((facet) => (
          <div key={facet.facet}>
            <FacetInput
              facet={facet}
              value={inputs[facet.facet] ?? ""}
              convertRomaji={preferences.convertRomaji}
              disabled={answered}
              onChange={(value) => setInputs((now) => ({ ...now, [facet.facet]: value }))}
            />
            {notes[facet.facet] && <p role="alert">{notes[facet.facet]}</p>}
          </div>
        ))}
        {!answered && (
          <p>
            <Button variant="primary" type="submit" disabled={busy}>
              Check
            </Button>
            {prompt.hint && <Button onClick={() => open("hint")}>Hint</Button>}
            {!shown.translation && <Button onClick={() => open("translation")}>Translation</Button>}
            {!shown.explanation && <Button onClick={() => open("explanation")}>Explanation</Button>}
            <Button variant="loud" disabled={busy} onClick={() => void send(true)}>
              Show answer
            </Button>
          </p>
        )}
      </form>
      {result && <Info prompt={prompt} result={result} />}
      {result && (
        <Button variant="primary" onClick={onDone}>
          Next
        </Button>
      )}
    </Card>
  );
};
