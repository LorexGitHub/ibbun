import { useEffect, useState } from "react";
import { Button, Card, Furigana } from "@mojibun/ui";
import { BATCH_TEXT_WAIT_MS, type BatchTextStatus, type LookupView, type Run, type SentenceView, type TextView } from "../contract.ts";
import type { LearnApi } from "./learn-client.ts";

const POLL_MS = 1_000;

/** Two styles: batch Words are bold and underlined, earlier Words only get a dotted underline. */
const HIGHLIGHT = {
  batch: { fontWeight: 700, textDecoration: "underline" },
  earlier: { textDecoration: "underline dotted" },
  none: {},
} satisfies Record<string, React.CSSProperties>;

type Waited = { state: "waiting" } | { state: "ready"; text: TextView } | { state: "late" };

/** Asks for the text of the batch every second until it is approved or `waitMs` has gone by. */
const useBatchText = (api: LearnApi, ids: string[], waitMs: number, pollMs: number): Waited => {
  const [waited, setWaited] = useState<Waited>({ state: "waiting" });
  useEffect(() => {
    let live = true;
    const deadline = Date.now() + waitMs;
    const ask = (): void => {
      api.text(ids).then(
        (status: BatchTextStatus) => {
          if (!live) return;
          if (status.status === "ready") return setWaited({ state: "ready", text: status.text });
          if (Date.now() >= deadline) return setWaited({ state: "late" });
          setTimeout(ask, pollMs);
        },
        () => live && setWaited({ state: "late" }),
      );
    };
    ask();
    return () => {
      live = false;
    };
  }, [api, ids.join(","), waitMs, pollMs]);
  return waited;
};

const RunView = ({ run, onTap }: { run: Run; onTap: (wordId: NonNullable<Run["wordId"]>) => void }) => {
  const text = <Furigana segments={[{ text: run.text, ...(run.reading && { reading: run.reading }) }]} />;
  if (!run.wordId) return text;
  const wordId = run.wordId;
  return (
    <button type="button" style={HIGHLIGHT[run.highlight ?? "none"]} data-highlight={run.highlight ?? "none"} onClick={() => onTap(wordId)}>
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

/**
 * The reading screen at the end of Learn (batch-text.md#reading-screen): skippable, never blocks Reviews.
 * Batch Words and earlier Words are highlighted in two styles; a tap on a Word is a lookup.
 */
export const ReadingStep = ({
  api,
  ids,
  onDone,
  waitMs = BATCH_TEXT_WAIT_MS,
  pollMs = POLL_MS,
}: {
  api: LearnApi;
  ids: string[];
  onDone: () => void;
  waitMs?: number;
  pollMs?: number;
}) => {
  const waited = useBatchText(api, ids, waitMs, pollMs);
  const [lookup, setLookup] = useState<LookupView | null>(null);
  return (
    <Card>
      <h1>Reading</h1>
      {waited.state === "waiting" && <p role="status">Preparing your story…</p>}
      {waited.state === "late" && (
        <p role="status">
          Your story is still being prepared. Read it later from <a href="/reading">Reading</a>.
        </p>
      )}
      {waited.state === "ready" && (
        <>
          <h2 lang="ja">{waited.text.title}</h2>
          <ol>
            {waited.text.sentences.map((s) => (
              <SentenceRow key={s.id} sentence={s} onTap={(id) => void api.lookUp(id).then(setLookup)} />
            ))}
          </ol>
          {lookup && <Lookup lookup={lookup} />}
        </>
      )}
      <Button variant={waited.state === "ready" ? "primary" : "secondary"} onClick={onDone}>
        {waited.state === "ready" ? "Done" : "Skip reading"}
      </Button>
    </Card>
  );
};
