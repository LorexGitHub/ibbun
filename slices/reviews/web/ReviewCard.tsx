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
  const blank = answered ? <strong>{target}</strong> : <span aria-label="blank">＿＿＿</span>;
  return (
    <p className="jp" lang="ja">
      {before}
      {prompt.mode === "highlight" ? <mark>{target}</mark> : blank}
      {after}
    </p>
  );
};

/** A line of text that is there only when `show` says so and the Example has the text. */
const Line = ({ text, show, lang }: { text: string | null; show: boolean; lang: "en" | "ja" }) =>
  show && text ? (
    <p lang={lang} className={lang === "ja" ? "jp" : undefined}>
      {text}
    </p>
  ) : null;

const FacetInput = (props: { facet: PromptFacet; value: string; convertRomaji: boolean; disabled: boolean; onChange: (value: string) => void }) => {
  const { facet, value, convertRomaji, disabled, onChange } = props;
  const common = { "aria-label": LABEL[facet.facet], value, disabled, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  if (!isJapanese(facet)) return <Input {...common} lang="en" />;
  return convertRomaji ? <KanaInput ime="hiragana" {...common} /> : <Input {...common} lang="ja" />;
};

const FacetField = (props: { facet: PromptFacet; value: string; note?: string; convertRomaji: boolean; disabled: boolean; onChange: (value: string) => void }) => {
  const { note, ...input } = props;
  return (
    <div>
      <FacetInput {...input} />
      {note && <p role="alert">{note}</p>}
    </div>
  );
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
    <Line text={prompt.translationEn} show lang="en" />
    <Line text={prompt.japaneseExplanation} show lang="ja" />
  </div>
);

/** The state of one Review: what is typed, what was tried before, what was opened, and the result. */
const useAnswering = (prompt: ReviewPrompt, preferences: Preferences, submit: Submit) => {
  const started = useRef(Date.now());
  const attempts = useRef<Partial<Record<Facet, string[]>>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Notes>({});
  const [opened, setOpened] = useState<Hint[]>([]);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (revealed: boolean) => {
    setBusy(true);
    const facets = prompt.facets.map((f) => ({ facet: f.facet, input: inputs[f.facet] ?? "", attempts: attempts.current[f.facet] ?? [] }));
    setResult(await submit({ studyItemId: prompt.studyItemId, exampleId: prompt.exampleId, facets, hintsOpened: opened, revealed, timeToAnswerMs: Date.now() - started.current }));
  };

  /** Not an answer, or an alternate's nudge: the try is kept in attempts[], never graded, and the field is cleared to try again. */
  const refuse = (refused: ReturnType<typeof notAnswers>) => {
    setNotes(Object.fromEntries(refused.map((r) => [r.facet, r.note])));
    for (const r of refused) attempts.current[r.facet] = [...(attempts.current[r.facet] ?? []), r.input];
    setInputs((now) => ({ ...now, ...Object.fromEntries(refused.map((r) => [r.facet, ""])) }));
  };

  const check = (event: FormEvent) => {
    event.preventDefault();
    const refused = notAnswers(prompt.facets, inputs, preferences.convertRomaji);
    if (refused.length === 0) void send(false);
    else refuse(refused);
  };

  return {
    inputs,
    notes,
    opened,
    result,
    busy,
    check,
    reveal: () => void send(true),
    type: (facet: Facet, value: string) => setInputs((now) => ({ ...now, [facet]: value })),
    open: (hint: Hint) => setOpened((now) => (now.includes(hint) ? now : [...now, hint])),
  };
};

const Actions = (props: { prompt: ReviewPrompt; preferences: Preferences; busy: boolean; open: (hint: Hint) => void; reveal: () => void }) => {
  const { prompt, preferences, busy, open, reveal } = props;
  const shown = shownByDefault(preferences.explanations);
  return (
    <p>
      <Button variant="primary" type="submit" disabled={busy}>
        Check
      </Button>
      {prompt.hint && <Button onClick={() => open("hint")}>Hint</Button>}
      {!shown.translation && <Button onClick={() => open("translation")}>Translation</Button>}
      {!shown.explanation && <Button onClick={() => open("explanation")}>Explanation</Button>}
      <Button variant="loud" disabled={busy} onClick={reveal}>
        Show answer
      </Button>
    </p>
  );
};

/** One Review. The first graded submission is final: there is no Undo. */
export const ReviewCard = (props: { prompt: ReviewPrompt; preferences: Preferences; submit: Submit; onDone: () => void }) => {
  const { prompt, preferences, submit, onDone } = props;
  const a = useAnswering(prompt, preferences, submit);
  const shown = shownByDefault(preferences.explanations);
  return (
    <Card>
      <form onSubmit={a.check}>
        <Sentence prompt={prompt} answered={a.result !== null} />
        <Line text={prompt.translationEn} show={shown.translation || a.opened.includes("translation")} lang="en" />
        <Line text={prompt.japaneseExplanation} show={shown.explanation || a.opened.includes("explanation")} lang="ja" />
        <Line text={prompt.hint} show={a.opened.includes("hint")} lang="en" />
        {prompt.facets.map((facet) => (
          <FacetField
            key={facet.facet}
            facet={facet}
            value={a.inputs[facet.facet] ?? ""}
            note={a.notes[facet.facet]}
            convertRomaji={preferences.convertRomaji}
            disabled={a.result !== null}
            onChange={(value) => a.type(facet.facet, value)}
          />
        ))}
        {a.result === null && <Actions prompt={prompt} preferences={preferences} busy={a.busy} open={a.open} reveal={a.reveal} />}
      </form>
      {a.result && (
        <>
          <Info prompt={prompt} result={a.result} />
          <Button variant="primary" onClick={onDone}>
            Next
          </Button>
        </>
      )}
    </Card>
  );
};
