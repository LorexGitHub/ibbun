import { useState } from "react";
import { Attribution, Furigana, Pill, pillClass } from "@mojibun/ui";
import type { LookupView, Run, TextView } from "../contract.ts";
import { levelName } from "./EpisodeList.tsx";
import "./reading.css";

type WordId = NonNullable<Run["wordId"]>;
type WordRun = Run & { wordId: WordId };
type Tap = (wordId: WordId) => void;

const isWord = (run: Run): run is WordRun => run.wordId !== null;

/** Each Word of the text once, in the order the Learner meets them. */
export const wordsOf = (text: TextView): WordRun[] => {
  const runs = text.sentences.flatMap((s) => s.runs).filter(isWord);
  return runs.filter((run, i) => runs.findIndex((other) => other.wordId === run.wordId) === i);
};

const RunText = ({ run, furigana }: { run: Run; furigana: boolean }) => (
  <Furigana segments={[{ text: run.text, ...(run.reading && { reading: run.reading }) }]} readings={furigana} />
);

const RunView = ({ run, furigana, onTap }: { run: Run; furigana: boolean; onTap: Tap }) =>
  isWord(run) ? (
    <button type="button" className={run.inBatch ? "word word-batch" : "word"} data-in-batch={run.inBatch} onClick={() => onTap(run.wordId)}>
      <RunText run={run} furigana={furigana} />
    </button>
  ) : (
    <RunText run={run} furigana={furigana} />
  );

const Switch = ({ label, on, onFlip }: { label: string; on: boolean; onFlip: (on: boolean) => void }) => (
  <button type="button" className={pillClass(on)} aria-pressed={on} onClick={() => onFlip(!on)}>
    {label}
  </button>
);

const Lookup = ({ lookup }: { lookup: LookupView }) => (
  <aside role="status" aria-label="Lookup" className="reader-lookup">
    <strong lang="ja">{lookup.label}</strong>
    {lookup.reading && <span lang="ja"> {lookup.reading}</span>}
    <p>{lookup.meanings.join("; ")}</p>
  </aside>
);

const WordList = ({ words, furigana, onTap }: { words: WordRun[]; furigana: boolean; onTap: Tap }) => (
  <aside aria-label="Words" className="reader-words">
    <h2>Words</h2>
    {words.length === 0 && <p>This text has no Words to look up.</p>}
    <ul>
      {words.map((run) => (
        <li key={run.wordId}>
          <RunView run={run} furigana={furigana} onTap={onTap} />
          {run.inBatch && <Pill>New</Pill>}
        </li>
      ))}
    </ul>
  </aside>
);

/**
 * A Batch Text or Reading Passage. Three switches in its header: furigana, the English translation, and the word list.
 * The word list starts hidden and the text sits in the middle; a tapped Word is looked up wherever it is tapped.
 */
export const TextReader = ({ text, onLookup }: { text: TextView; onLookup: (wordId: string) => Promise<LookupView> }) => {
  const [furigana, setFurigana] = useState(true);
  const [translation, setTranslation] = useState(false);
  const [wordList, setWordList] = useState(false);
  const [lookup, setLookup] = useState<LookupView | null>(null);
  const tap: Tap = (wordId) => void onLookup(wordId).then(setLookup);
  return (
    <article className="reader" data-words={wordList}>
      <header className="reader-head">
        <div>
          <h1 lang="ja">{text.title}</h1>
          {text.episode && (
            <p>
              Episode {text.episode.number} · {levelName(text.episode.level)}
            </p>
          )}
        </div>
        <div role="group" aria-label="Reader" className="reader-switches">
          <Switch label="Furigana" on={furigana} onFlip={setFurigana} />
          <Switch label="Translation" on={translation} onFlip={setTranslation} />
          <Switch label="Words" on={wordList} onFlip={setWordList} />
        </div>
      </header>
      <div className="reader-body">
        <div className="reader-text">
          <ol>
            {text.sentences.map((sentence) => (
              <li key={sentence.id}>
                <span lang="ja">
                  {sentence.runs.map((run, i) => (
                    <RunView key={i} run={run} furigana={furigana} onTap={tap} />
                  ))}
                </span>
                {translation && sentence.translation !== null && <em>{sentence.translation}</em>}
              </li>
            ))}
          </ol>
          {lookup && <Lookup lookup={lookup} />}
          <Attribution credits={text.credits} />
        </div>
        {wordList && <WordList words={wordsOf(text)} furigana={furigana} onTap={tap} />}
      </div>
    </article>
  );
};
