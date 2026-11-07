import { useRef, useState, type FormEvent } from "react";
import { Button, Card, Input, KanaInput, Pill } from "@mojibun/ui";
import type { Facet, QuizPrompt } from "../contract.ts";
import { acceptedOf, isJapanese, notAnswers, shownByDefault, tryFacet, type PromptFacet } from "./check.ts";
import type { Given } from "./queue.ts";

type Preferences = { convertRomaji: boolean; explanations: "english" | "japanese" | "both" };
type Notes = Partial<Record<Facet, string>>;
type Marked = { facet: PromptFacet; input: string; passed: boolean; message?: string };

const LABEL: Record<Facet, string> = { cloze: "Answer", reading: "Reading in this sentence", meaning: "Meaning of the kanji" };

const Sentence = ({ prompt, answered }: { prompt: QuizPrompt; answered: boolean }) => {
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

const FacetInput = (props: { facet: PromptFacet; value: string; convertRomaji: boolean; disabled: boolean; onChange: (value: string) => void }) => {
  const { facet, value, convertRomaji, disabled, onChange } = props;
  const common = { "aria-label": LABEL[facet.facet], value, disabled, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  if (!isJapanese(facet)) return <Input {...common} lang="en" />;
  return convertRomaji ? <KanaInput ime="hiragana" {...common} /> : <Input {...common} lang="ja" />;
};

const Feedback = ({ prompt, marked }: { prompt: QuizPrompt; marked: Marked[] }) => {
  const passed = marked.every((m) => m.passed);
  return (
    <div role="status">
      <p>
        <Pill ink={passed}>{passed ? "Correct" : "Not quite. You will be asked again."}</Pill>
      </p>
      {marked.map((m) => (
        <p key={m.facet.facet}>
          {LABEL[m.facet.facet]}: {m.passed ? "correct" : `wrong. It is ${acceptedOf(m.facet).join(" / ")}`}
          {m.message ? ` — ${m.message}` : ""}
        </p>
      ))}
      {prompt.translationEn && <p lang="en">{prompt.translationEn}</p>}
      {prompt.japaneseExplanation && (
        <p lang="ja" className="jp">
          {prompt.japaneseExplanation}
        </p>
      )}
    </div>
  );
};

/** One quiz question. A miss is shown with its answer; the quiz asks it again later. */
export const QuestionCard = (props: { prompt: QuizPrompt; preferences: Preferences; onDone: (given: Given[], timeToAnswerMs: number) => void }) => {
  const { prompt, preferences, onDone } = props;
  const started = useRef(Date.now());
  const attempts = useRef<Partial<Record<Facet, string[]>>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Notes>({});
  const [marked, setMarked] = useState<Marked[] | null>(null);
  const shown = shownByDefault(preferences.explanations);

  /** Not an answer, or an alternate's nudge: the try is kept in attempts[], never graded, and the field is cleared. */
  const refuse = (refused: ReturnType<typeof notAnswers>) => {
    setNotes(Object.fromEntries(refused.map((r) => [r.facet, r.note])));
    for (const r of refused) attempts.current[r.facet] = [...(attempts.current[r.facet] ?? []), r.input];
    setInputs((now) => ({ ...now, ...Object.fromEntries(refused.map((r) => [r.facet, ""])) }));
  };

  const check = (event: FormEvent) => {
    event.preventDefault();
    const refused = notAnswers(prompt.facets, inputs, preferences.convertRomaji);
    if (refused.length > 0) return refuse(refused);
    setNotes({});
    setMarked(
      prompt.facets.map((facet) => {
        const input = inputs[facet.facet] ?? "";
        const { result } = tryFacet(facet, input, preferences.convertRomaji);
        return { facet, input, passed: result.outcome === "pass", message: result.message };
      }),
    );
  };

  const next = () =>
    onDone(
      marked!.map((m) => ({ facet: m.facet.facet, input: m.input, passed: m.passed, attempts: attempts.current[m.facet.facet] ?? [] })),
      Date.now() - started.current,
    );

  return (
    <Card>
      <form onSubmit={check}>
        <Sentence prompt={prompt} answered={marked !== null} />
        {shown.translation && prompt.translationEn && <p lang="en">{prompt.translationEn}</p>}
        {shown.explanation && prompt.japaneseExplanation && (
          <p lang="ja" className="jp">
            {prompt.japaneseExplanation}
          </p>
        )}
        {prompt.facets.map((facet) => (
          <div key={facet.facet}>
            <FacetInput
              facet={facet}
              value={inputs[facet.facet] ?? ""}
              convertRomaji={preferences.convertRomaji}
              disabled={marked !== null}
              onChange={(value) => setInputs((now) => ({ ...now, [facet.facet]: value }))}
            />
            {notes[facet.facet] && <p role="alert">{notes[facet.facet]}</p>}
          </div>
        ))}
        {marked === null && (
          <Button variant="primary" type="submit">
            Check
          </Button>
        )}
      </form>
      {marked && (
        <>
          <Feedback prompt={prompt} marked={marked} />
          <Button variant="primary" onClick={next}>
            Next
          </Button>
        </>
      )}
    </Card>
  );
};
