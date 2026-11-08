import { useState } from "react";
import { Attribution, Button, Card, Furigana } from "@mojibun/ui";
import type { LookupView, Run, SentenceView, TextView } from "../contract.ts";

const RunView = ({ run, onTap }: { run: Run; onTap: (wordId: NonNullable<Run["wordId"]>) => void }) => {
  const text = <Furigana segments={[{ text: run.text, ...(run.reading && { reading: run.reading }) }]} />;
  if (!run.wordId) return text;
  const wordId = run.wordId;
  return (
    <button type="button" className={run.inBatch ? "word word-batch" : "word"} data-in-batch={run.inBatch} onClick={() => onTap(wordId)}>
      {text}
    </button>
  );
};

/** One Sentence; its English translation stays hidden until tapped. */
const SentenceRow = ({ sentence, onTap }: { sentence: SentenceView; onTap: (wordId: NonNullable<Run["wordId"]>) => void }) => {
  const [shown, setShown] = useState(false);
  return (
    <li>
      <span lang="ja">
        {sentence.runs.map((run, i) => (
          <RunView key={i} run={run} onTap={onTap} />
        ))}
      </span>{" "}
      {sentence.translation !== null &&
        (shown ? (
          <em>{sentence.translation}</em>
        ) : (
          <Button variant="secondary" onClick={() => setShown(true)}>
            Show translation
          </Button>
        ))}
    </li>
  );
};

const Lookup = ({ lookup }: { lookup: LookupView }) => (
  <aside role="status" aria-label="Lookup">
    <strong lang="ja">{lookup.label}</strong>
    {lookup.reading && <span lang="ja"> {lookup.reading}</span>}
    <p>{lookup.meanings.join("; ")}</p>
  </aside>
);

/** A Batch Text or Reading Passage: tap a Word for a lookup, tap a Sentence's button for its translation. */
export const TextReader = ({ text, onLookup }: { text: TextView; onLookup: (wordId: string) => Promise<LookupView> }) => {
  const [lookup, setLookup] = useState<LookupView | null>(null);
  return (
    <Card>
      <h1 lang="ja">{text.title}</h1>
      {text.episode && (
        <p>
          Episode {text.episode.number} · {text.episode.level === "unlevelled" ? "Unlevelled" : text.episode.level}
        </p>
      )}
      <ol>
        {text.sentences.map((s) => (
          <SentenceRow key={s.id} sentence={s} onTap={(id) => void onLookup(id).then(setLookup)} />
        ))}
      </ol>
      {lookup && <Lookup lookup={lookup} />}
      <Attribution credits={text.credits} />
    </Card>
  );
};
