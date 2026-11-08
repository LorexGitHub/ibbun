import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@mojibun/ui";
import type { Batch, BatchItem, QuizAnswer, State, Track } from "../contract.ts";
import { ClipLessonCard } from "../listening/web/ClipLessonCard.tsx";
import { learnApi, type LearnApi } from "./api.ts";
import { LessonCard } from "./LessonCard.tsx";
import { Quiz } from "./Quiz.tsx";
import { TrackGrid } from "./TrackGrid.tsx";

type Taught = Extract<BatchItem, { lesson: unknown }>;
const hasQuiz = (item: BatchItem): item is Taught => "lesson" in item;

/** Every lesson is done and no item is left for the batch quiz: a batch of Listening Clips ends with the last clip. */
const settled = (items: BatchItem[], at: number) => at >= items.length && !items.some(hasQuiz);

/**
 * The lessons of a batch one by one, then the quiz. "I know this" drops an item from both. A Listening Clip is
 * taught whole, quiz included, in its turn.
 */
const Session = ({ batch, api, onFinished }: { batch: Batch; api: LearnApi; onFinished: (learned: number) => void }) => {
  const [items, setItems] = useState<BatchItem[]>(batch.items);
  const [at, setAt] = useState(0);
  const [clipsPassed, setClipsPassed] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const fail = (e: Error) => setFailed(e.message);

  const known = (item: Taught) =>
    api.skip(item.lesson.studyItemId).then(() => {
      const rest = items.filter((i) => i !== item);
      setItems(rest);
      if (settled(rest, at)) onFinished(clipsPassed);
    }, fail);
  const clipDone = () => {
    setClipsPassed(clipsPassed + 1);
    setAt(at + 1);
    if (settled(items, at + 1)) onFinished(clipsPassed + 1);
  };
  const passed = (answers: QuizAnswer[]) => api.complete({ answers }).then((n) => onFinished(n + clipsPassed), fail);

  const item = items[at];
  return (
    <section>
      {failed && <p role="alert">{failed}</p>}
      {!item ? (
        <Quiz prompts={items.filter(hasQuiz).map((i) => i.prompt)} preferences={batch.preferences} onPassed={(a) => void passed(a)} />
      ) : (
        <>
          <p>
            Lesson {at + 1} of {items.length}
          </p>
          {"clip" in item ? (
            <ClipLessonCard key={item.clip.studyItemId} clip={item.clip} check={api.answerClip} onPassed={clipDone} />
          ) : (
            <LessonCard
              key={item.lesson.studyItemId}
              lesson={item.lesson}
              last={at === items.length - 1}
              onNext={() => setAt(at + 1)}
              onKnown={() => void known(item)}
            />
          )}
        </>
      )}
    </section>
  );
};

/** The Learn screen: choose Active Tracks, take a batch, learn it, pass the quiz. */
export const LearnScreen = ({ api = learnApi }: { api?: LearnApi }) => {
  const [loaded, setLoaded] = useState<{ state: State; batch: Batch } | null>(null);
  const [learned, setLearned] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
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
    void load();
  };

  if (failed) return <p role="alert">{failed}</p>;
  if (!loaded) return <p>Loading…</p>;
  const { state, batch } = loaded;
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
          onClick={() => {
            setLearned(null);
            setStarted(true);
          }}
        >
          Start batch
        </Button>
      ) : (
        <p>{batch.remaining === 0 ? "You have used the budget for new items today. Come back tomorrow." : "Nothing new is left in your active Tracks."}</p>
      )}
    </section>
  );
};
