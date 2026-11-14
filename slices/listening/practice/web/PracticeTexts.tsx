import { useEffect, useState } from "react";
import { Button } from "@ibbun/ui";
import type { JlptLevel } from "@ibbun/shared";
import type { ClipView } from "../../contract.ts";
import { ClipCard } from "../../web/ClipCard.tsx";
import { LENGTHS, TOPICS, taskTypes, type LibraryEntry, type Options } from "../practice-contract.ts";
import { answerPractice, generate, loadLibrary, loadOptions, loadPractice } from "./practice-api.ts";

/** How long the Learner waits for a new dialogue before it goes to the library (listening.md#what-a-practice-text-is). */
export const WAIT_MS = 20_000;
const POLL_MS = 2_000;

const LENGTH_LABEL = { short: "Short", medium: "Medium", exam: "Exam length" } as const;
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Polls until the dialogue is ready or the wait is over. */
const readyWithin = async (id: string): Promise<ClipView | null> => {
  for (let waited = 0; waited <= WAIT_MS; waited += POLL_MS) {
    const view = await loadPractice(id);
    if (view) return view;
    await wait(POLL_MS);
  }
  return null;
};

/** The fixed choices only: a level, a 聴解 task type, a length and a topic. Nothing typed reaches the LLM. */
const GenerateForm = ({ options, onStart }: { options: Options; onStart: (choice: GenerateChoice) => void }) => {
  const [level, setLevel] = useState<JlptLevel>(options.cleared[0]!);
  const [passageType, setPassageType] = useState("any");
  const [length, setLength] = useState<(typeof LENGTHS)[number]>("short");
  const [topic, setTopic] = useState<(typeof TOPICS)[number] | "">("");
  return (
    <form onSubmit={(e) => (e.preventDefault(), onStart({ level, passageType, length, ...(topic && { topic }) }))}>
      <label>
        Level
        <select value={level} onChange={(e) => (setLevel(e.target.value as JlptLevel), setPassageType("any"))}>
          {options.cleared.map((l) => <option key={l}>{l}</option>)}
        </select>
      </label>
      <label>
        Question type
        <select value={passageType} onChange={(e) => setPassageType(e.target.value)}>
          <option value="any">Any</option>
          {taskTypes(level).map((t) => <option key={t} value={t}>{t}</option>)}
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
        <select value={topic} onChange={(e) => setTopic(e.target.value as typeof topic)}>
          <option value="">Any</option>
          {TOPICS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <Button type="submit" variant="primary">Generate a dialogue</Button>
    </form>
  );
};

const Library = ({ entries, onOpen }: { entries: LibraryEntry[]; onOpen: (id: string) => void }) => (
  <ul aria-label="Your dialogues">
    {entries.map((e) => (
      <li key={e.id}>
        {e.level} · {e.passageType === "any" ? "any type" : e.passageType} · {LENGTH_LABEL[e.length]}
        {e.topic && <span lang="ja"> · {e.topic}</span>}{" "}
        {e.ready ? <Button onClick={() => onOpen(e.id)}>Listen</Button> : <span>Being made…</span>}
      </li>
    ))}
  </ul>
);

/** What the Learner can do now: unlock a level, wait, come back tomorrow, or generate. */
const Offer = ({ options, making, onStart }: { options: Options; making: boolean; onStart: Parameters<typeof GenerateForm>[0]["onStart"] }) => {
  if (options.cleared.length === 0) return <p>Know every Kanji of a level to unlock dialogues at that level.</p>;
  if (making) return <p role="status">Making your dialogue…</p>;
  if (options.remaining === 0) return <p>You have used today's practice dialogues. Try again tomorrow.</p>;
  return (
    <>
      <p>{options.remaining} left today.</p>
      <GenerateForm options={options} onStart={onStart} />
    </>
  );
};

type Screen = { at: "menu"; message?: string } | { at: "making" } | { at: "playing"; id: string; view: ClipView };

type GenerateChoice = Parameters<typeof generate>[0];

/** Generates a dialogue and waits for it; the Learner ends up playing it, or reading why not. */
const generateAndWait = async (choice: GenerateChoice): Promise<Screen> => {
  try {
    const id = await generate(choice);
    const view = await readyWithin(id);
    return view ? { at: "playing", id, view } : { at: "menu", message: "Your dialogue is still being made. It will appear in your library when it is ready." };
  } catch (error) {
    return { at: "menu", message: error instanceof Error ? error.message : "Something went wrong." };
  }
};

/**
 * Practice Text dialogues for the Learner's Cleared Levels (listening.md#practice-texts).
 * `onPlaying` hears when a dialogue starts and stops playing, so the screen can show one player at a time.
 */
export const PracticeTexts = ({ onPlaying }: { onPlaying?: (playing: boolean) => void }) => {
  const [options, setOptions] = useState<Options | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [screen, setScreen] = useState<Screen>({ at: "menu" });

  const refresh = () => Promise.all([loadOptions(), loadLibrary()]).then(([o, l]) => (setOptions(o), setLibrary(l)));
  // The section is an extra: when its options cannot load, free practice above still works and this stays hidden.
  useEffect(() => void refresh().catch(() => setOptions(null)), []);

  const playing = screen.at === "playing";
  useEffect(() => onPlaying?.(playing), [playing]);

  const open = async (id: string) => {
    const view = await loadPractice(id);
    setScreen(view ? { at: "playing", id, view } : { at: "menu", message: "That dialogue is still being made." });
  };

  const start = async (choice: GenerateChoice) => {
    setScreen({ at: "making" });
    setScreen(await generateAndWait(choice));
    await refresh();
  };

  if (!options) return null;
  if (screen.at === "playing") {
    const { id, view } = screen;
    return (
      <section className="listening-dialogues" aria-label="Practice dialogue">
        <h2>Practice dialogue</h2>
        <ClipCard key={view.exampleId} view={view} answerWith={answerPractice} nextLabel="Next question" onNext={() => open(id)} />
        <Button onClick={() => setScreen({ at: "menu" })}>Back to your dialogues</Button>
      </section>
    );
  }
  return (
    <section className="listening-dialogues" aria-label="Practice dialogues">
      <h2>Practice dialogues</h2>
      <Offer options={options} making={screen.at === "making"} onStart={start} />
      {screen.at === "menu" && screen.message && <p role="status">{screen.message}</p>}
      {library.length > 0 && <Library entries={library} onOpen={open} />}
    </section>
  );
};
