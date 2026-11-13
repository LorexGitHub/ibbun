import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button, Card } from "@ibbun/ui";
import type { JlptLevel } from "@ibbun/shared";
import { ANY, LENGTHS, PASSAGE_TYPES, TOPICS, type Library, type PracticeOptions, type PracticeResult } from "../contract.ts";
import { Shown, TextShown, useLoaded } from "../../web/screens.tsx";
import { generate, loadLibrary, loadOptions, loadPracticeText } from "./practice-client.ts";

const LENGTH_LABEL = { short: "Short", medium: "Medium", exam: "Exam length" } as const;

type Outcome = Exclude<PracticeResult, { status: "ready" }> | { status: "failed" } | null;

const Notice = ({ outcome }: { outcome: Outcome }) => {
  if (outcome?.status === "limit") return <p role="status">Try again tomorrow.</p>;
  if (outcome?.status === "waiting") return <p role="status">Your text is still being made. It will appear in your library when it is ready.</p>;
  if (outcome?.status === "failed") return <p role="status">Could not start your text. Try again.</p>;
  return null;
};

/** Every choice comes from a list: nothing a Learner types reaches the LLM (listening.md#what-the-learner-chooses). */
const GenerateForm = ({ options, onOutcome }: { options: PracticeOptions; onOutcome: (outcome: Outcome) => void }) => {
  const navigate = useNavigate();
  const [level, setLevel] = useState<JlptLevel>(options.clearedLevels[0]!);
  const [passageType, setPassageType] = useState(ANY);
  const [length, setLength] = useState<(typeof LENGTHS)[number]>("short");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    onOutcome(null);
    try {
      const result = await generate({ level, passageType, length, ...(topic && { topic: topic as (typeof TOPICS)[number] }) });
      if (result.status === "ready") return navigate(`/reading/practice/${result.id}`);
      onOutcome(result);
    } catch {
      onOutcome({ status: "failed" });
    } finally {
      setBusy(false);
    }
  };

  if (options.remaining === 0) return <p>You have used today's practice texts. Try again tomorrow.</p>;
  return (
    <form onSubmit={(e) => (e.preventDefault(), void submit())}>
      <label>
        Level
        <select value={level} onChange={(e) => (setLevel(e.target.value as JlptLevel), setPassageType(ANY))}>
          {options.clearedLevels.map((l) => <option key={l}>{l}</option>)}
        </select>
      </label>
      <label>
        Passage type
        <select value={passageType} onChange={(e) => setPassageType(e.target.value)}>
          <option value={ANY}>Any</option>
          {PASSAGE_TYPES[level].map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <label>
        Length
        <select value={length} onChange={(e) => setLength(e.target.value as typeof length)}>
          {LENGTHS.map((l) => <option key={l} value={l}>{LENGTH_LABEL[l]}</option>)}
        </select>
      </label>
      <label>
        Topic
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Any</option>
          {TOPICS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <p>{options.remaining} left in the next 24 hours.</p>
      <Button type="submit" disabled={busy}>{busy ? "Writing your text…" : "Generate"}</Button>
    </form>
  );
};

const LibraryList = ({ library }: { library: Library }) => (
  <section>
    <h2>Your library</h2>
    {library.texts.length === 0 && <p>Nothing here yet.</p>}
    <ul>
      {library.texts.map((t) => (
        <li key={t.id}>
          {t.title ? <Link to={`/reading/practice/${t.id}`}><span lang="ja">{t.title}</span></Link> : "Still being made"} · {t.level} · {t.passageType}
          {t.topic && <> · <span lang="ja">{t.topic}</span></>}
        </li>
      ))}
    </ul>
  </section>
);

export const PracticeScreen = () => {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [round, setRound] = useState(0);
  const options = useLoaded(loadOptions, `options:${round}`);
  const library = useLoaded(loadLibrary, `library:${round}`);
  return (
    <Card>
      <h1>Practice texts</h1>
      <Shown loaded={options}>
        {(o) =>
          o.clearedLevels.length === 0 ? (
            <p>Practice texts open once you know every kanji of a JLPT level.</p>
          ) : (
            <GenerateForm options={o} onOutcome={(result) => (setOutcome(result), result && setRound((r) => r + 1))} />
          )
        }
      </Shown>
      <Notice outcome={outcome} />
      <Shown loaded={library}>{(l) => <LibraryList library={l} />}</Shown>
    </Card>
  );
};

export const PracticeTextScreen = () => {
  const { id = "" } = useParams();
  return <TextShown loaded={useLoaded(() => loadPracticeText(id), `practice:${id}`)} />;
};
