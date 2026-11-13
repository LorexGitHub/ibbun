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
    <p className="jp sentence" lang="ja">
      {before}
      {prompt.mode === "highlight" ? <mark>{target}</mark> : blank}
      {after}
    </p>
  );
};

const FacetInput = (props: { facet: PromptFacet; value: string; convertRomaji: boolean; disabled: boolean; autoFocus: boolean; onChange: (value: string) => void }) => {
  const { facet, value, convertRomaji, disabled, autoFocus, onChange } = props;
  const common = { "aria-label": LABEL[facet.facet], value, disabled, autoFocus, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  if (!isJapanese(facet)) return <Input {...common} lang="en" />;
  return convertRomaji ? <KanaInput ime="hiragana" {...common} /> : <Input {...common} lang="ja" />;
};

const Feedback = ({ prompt, marked }: { prompt: QuizPrompt; marked: Marked[] }) => {
  const passed = marked.every((m) => m.passed);
  return (
    <div role="status" className="feedback">
      <p>
        <Pill ink={passed}>{passed ? "Correct" : "Not quite. You will be asked again."}</Pill>
      </p>
      {marked.map((m) => (
        <p key={m.facet.facet} className={m.passed ? "answer answer--right" : "answer answer--miss"}>
          {LABEL[m.facet.facet]}: {m.passed ? "correct" : `wrong. It is ${acceptedOf(m.facet).join(" / ")}`}
          {m.message ? ` — ${m.message}` : ""}
        </p>
      ))}
      {prompt.translationEn && (
        <p lang="en" className="muted">
          {prompt.translationEn}
        </p>
      )}
      {prompt.japaneseExplanation && (
        <p lang="ja" className="jp muted">
          {prompt.japaneseExplanation}
        </p>
      )}
    </div>
  );
};

/** The state of one question: what is typed, what was tried before, and how it was marked. */
const useQuestion = (prompt: QuizPrompt, preferences: Preferences, onDone: (given: Given[], timeToAnswerMs: number) => void) => {
  const started = useRef(Date.now());
  const attempts = useRef<Partial<Record<Facet, string[]>>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Notes>({});
  const [marked, setMarked] = useState<Marked[] | null>(null);

  /** Not an answer, or an alternate's nudge: the try is kept in attempts[], never graded, and the field is cleared. */
  const refuse = (refused: ReturnType<typeof notAnswers>) => {
    setNotes(Object.fromEntries(refused.map((r) => [r.facet, r.note])));
    for (const r of refused) attempts.current[r.facet] = [...(attempts.current[r.facet] ?? []), r.input];
    setInputs((now) => ({ ...now, ...Object.fromEntries(refused.map((r) => [r.facet, ""])) }));
  };

  const mark = () => {
    setNotes({});
    setMarked(
      prompt.facets.map((facet) => {
        const input = inputs[facet.facet] ?? "";
        const { result } = tryFacet(facet, input, preferences.convertRomaji);
        return { facet, input, passed: result.outcome === "pass", message: result.message };
      }),
    );
  };

  return {
    inputs,
    notes,
    marked,
    type: (facet: Facet, value: string) => setInputs((now) => ({ ...now, [facet]: value })),
    check: (event: FormEvent) => {
      event.preventDefault();
      const refused = notAnswers(prompt.facets, inputs, preferences.convertRomaji);
      if (refused.length > 0) refuse(refused);
      else mark();
    },
    next: () =>
      onDone(
        marked!.map((m) => ({ facet: m.facet.facet, input: m.input, passed: m.passed, attempts: attempts.current[m.facet.facet] ?? [] })),
        Date.now() - started.current,
      ),
  };
};

/** One quiz question. A miss is shown with its answer; the quiz asks it again later. */
export const QuestionCard = (props: { prompt: QuizPrompt; preferences: Preferences; onDone: (given: Given[], timeToAnswerMs: number) => void }) => {
  const { prompt, preferences, onDone } = props;
  const q = useQuestion(prompt, preferences, onDone);
  const shown = shownByDefault(preferences.explanations);
  return (
    <Card className="question">
      <form onSubmit={q.check}>
        <Sentence prompt={prompt} answered={q.marked !== null} />
        {shown.translation && prompt.translationEn && (
          <p lang="en" className="muted">
            {prompt.translationEn}
          </p>
        )}
        {shown.explanation && prompt.japaneseExplanation && (
          <p lang="ja" className="jp muted">
            {prompt.japaneseExplanation}
          </p>
        )}
        <div className="fields">
          {prompt.facets.map((facet, i) => (
            <div key={facet.facet} className="field">
              <span className="caps" aria-hidden="true">
                {LABEL[facet.facet]}
              </span>
              <FacetInput
                autoFocus={i === 0}
                facet={facet}
                value={q.inputs[facet.facet] ?? ""}
                convertRomaji={preferences.convertRomaji}
                disabled={q.marked !== null}
                onChange={(value) => q.type(facet.facet, value)}
              />
              {q.notes[facet.facet] && <p role="alert">{q.notes[facet.facet]}</p>}
            </div>
          ))}
        </div>
        {q.marked === null && (
          <div className="lesson-actions">
            <Button variant="primary" type="submit" hotkey="Enter">
              Check
            </Button>
          </div>
        )}
      </form>
      {q.marked && (
        <>
          <Feedback prompt={prompt} marked={q.marked} />
          <div className="lesson-actions">
            <Button variant="primary" hotkey="Enter" onClick={q.next}>
              Next
            </Button>
          </div>
        </>
      )}
    </Card>
  );
};
