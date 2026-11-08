import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@mojibun/ui";
import type { Batch, QuizAnswer, State, Track } from "../contract.ts";
import { learnApi, type LearnApi } from "./learn-client.ts";
import { LessonCard } from "./LessonCard.tsx";
import { Quiz } from "./Quiz.tsx";
import { ReadingStep } from "./ReadingStep.tsx";
import { TrackGrid } from "./TrackGrid.tsx";

type Item = Batch["items"][number];

/** The lessons of a batch one by one, then the quiz. "I know this" drops an item from both. */
const Session = ({ batch, api, onFinished }: { batch: Batch; api: LearnApi; onFinished: (learned: number) => void }) => {
  const [items, setItems] = useState<Item[]>(batch.items);
  const [at, setAt] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const fail = (e: Error) => setFailed(e.message);

  const known = (item: Item) =>
    api.skip(item.lesson.studyItemId).then(() => {
      const rest = items.filter((i) => i !== item);
      setItems(rest);
      if (rest.length === 0) onFinished(0);
    }, fail);
  const passed = (answers: QuizAnswer[]) => api.complete({ answers }).then(onFinished, fail);

  const item = items[at];
  return (
    <section>
      {failed && <p role="alert">{failed}</p>}
      {item ? (
        <>
          <p>
            Lesson {at + 1} of {items.length}
          </p>
          <LessonCard
            key={item.lesson.studyItemId}
            lesson={item.lesson}
            last={at === items.length - 1}
            onNext={() => setAt(at + 1)}
            onKnown={() => void known(item)}
          />
        </>
      ) : (
        <Quiz prompts={items.map((i) => i.prompt)} preferences={batch.preferences} onPassed={(a) => void passed(a)} />
      )}
    </section>
  );
};

/** The Learn screen: choose Active Tracks, take a batch, learn it, pass the quiz. */
export const LearnScreen = ({ api = learnApi }: { api?: LearnApi }) => {
  const [loaded, setLoaded] = useState<{ state: State; batch: Batch } | null>(null);
  const [learned, setLearned] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  /** The batch whose Batch Text the reading screen waits for, once its quiz has passed. */
  const [reading, setReading] = useState<{ ids: string[] } | null>(null);
  const [asked, setAsked] = useState<{ ids: string[]; enqueued: boolean } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(
    () => Promise.all([api.state(), api.batch()]).then(([state, batch]) => setLoaded({ state, batch }), (e: Error) => setFailed(e.message)),
    [api],
  );
  useEffect(() => void load(), [load]);

  const saveTracks = (tracks: Track[]) => api.saveTracks(tracks).then(load, (e: Error) => setFailed(e.message));
  const finished = (n: number) => {
    setLearned(n);
    setStarted(false);
    if (n > 0 && asked?.enqueued) setReading({ ids: asked.ids });
    void load();
  };
  const start = (batch: Batch) => {
    const ids = batch.items.map((i) => i.lesson.studyItemId);
    setLearned(null);
    setStarted(true);
    setAsked({ ids, enqueued: false });
    // The batch is still learnable without a text, so a failed request only means there is none to wait for.
    void api.startText(ids).then((enqueued) => setAsked({ ids, enqueued }), () => undefined);
  };

  if (failed) return <p role="alert">{failed}</p>;
  if (!loaded) return <p>Loading…</p>;
  const { state, batch } = loaded;
  if (reading) return <ReadingStep api={api} ids={reading.ids} onDone={() => setReading(null)} />;
  if (started) return <Session batch={batch} api={api} onFinished={finished} />;
  return (
    <section>
      <h1>Learn</h1>
      {learned !== null && <Card>{learned > 0 ? `${learned} new items are in your Reviews.` : "Skipped."}</Card>}
      <p>
        {state.learnedToday} of {state.dailyBudget} new items learned today. {batch.items.length} in this batch.
      </p>
      <TrackGrid tracks={state.activeTracks} onChange={(t) => void saveTracks(t)} />
      {batch.items.length > 0 ? (
        <Button
          variant="primary"
          big
          onClick={() => start(batch)}
        >
          Start batch
        </Button>
      ) : (
        <p>{batch.remaining === 0 ? "You have used the budget for new items today. Come back tomorrow." : "Nothing new is left in your active Tracks."}</p>
      )}
    </section>
  );
};
