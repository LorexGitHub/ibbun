import { useCallback, useEffect, useState } from "react";
import { buttonClass, State as Shown, useLevelFilter } from "@ibbun/ui";
import type { Batch, State, Track } from "../contract.ts";
import { isTaught, type Tally } from "./batch-view.ts";
import { learnApi, type LearnApi } from "./learn-client.ts";
import { Session } from "./Session.tsx";
import { StartPage } from "./StartPage.tsx";
import { Ending, type Story } from "./TallyScreen.tsx";
import "./learn.css";

/** The Study Item Learn now was asked for: `/learn?now=<id>`, which Browse links to. */
const nowFromUrl = () => new URLSearchParams(globalThis.location?.search).get("now");

/** Learn now: one item and its dependencies through the normal lesson and quiz. */
const LearnNow = ({ id, api, onFinished }: { id: string; api: LearnApi; onFinished: (tally: Tally) => void }) => {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(() => {
    setFailed(null);
    void api.now(id).then(setBatch, (e: Error) => setFailed(e.message));
  }, [api, id]);
  useEffect(load, [load]);
  if (failed) return <Failed message={failed} onRetry={load} />;
  if (!batch) return <p>Loading…</p>;
  if (batch.items.length === 0) return <NothingToTeach />;
  return <Session batch={batch} api={api} now onFinished={onFinished} />;
};

const Failed = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Shown heading={1} mark="新" title="Learn did not load" note={message} onRetry={onRetry} />
);

const NothingToTeach = () => (
  <Shown heading={1} mark="新" title="This item cannot be taught yet" fact="It has nothing to learn it by yet, such as an Example.">
    <a className={buttonClass({ variant: "primary" })} href="/learn">
      Learn something else
    </a>
  </Shown>
);

type Asked = { ids: string[]; enqueued: boolean } | null;

/** The batch to read about once a quiz is passed: only a passed batch whose text was requested. */
const readingFor = (learned: number, asked: Asked): Story | null => (learned > 0 && asked?.enqueued ? { ids: asked.ids } : null);

/** The Learn screen: choose where to draw from, take a batch, learn it, pass the quiz, and go on from the Tally. */
export const LearnScreen = ({ api = learnApi, nowId = nowFromUrl() }: { api?: LearnApi; nowId?: string | null }) => {
  const [now, setNow] = useState(nowId);
  const [loaded, setLoaded] = useState<{ state: State; batch: Batch } | null>(null);
  const [ended, setEnded] = useState<{ tally: Tally; story: Story | null } | null>(null);
  const [started, setStarted] = useState(false);
  const [asked, setAsked] = useState<Asked>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const level = useLevelFilter();
  const load = useCallback(
    () => Promise.all([api.state(), api.batch(level)]).then(([state, batch]) => setLoaded({ state, batch }), (e: Error) => setFailed(e.message)),
    [api, level],
  );
  useEffect(() => void load(), [load]);

  const saveTracks = (tracks: Track[]) => api.saveTracks(tracks).then(load, (e: Error) => setFailed(e.message));
  const finished = (tally: Tally) => {
    setEnded({ tally, story: readingFor(tally.learned, asked) });
    setStarted(false);
    setNow(null);
    // The batch just learned is not the next one, so "Keep going" waits for the load.
    setLoaded(null);
    void load();
  };
  const start = (batch: Batch) => {
    const ids = batch.items.filter(isTaught).map((i) => i.lesson.studyItemId);
    setStarted(true);
    setAsked({ ids, enqueued: false });
    // The batch is still learnable without a text, so a failed request only means there is none to offer.
    void api.startText(ids).then((enqueued) => setAsked({ ids, enqueued }), () => undefined);
  };
  const keepGoing = (batch: Batch) => {
    setEnded(null);
    if (batch.items[0]) start(batch);
  };

  if (now) return <LearnNow id={now} api={api} onFinished={finished} />;
  if (failed) return <Failed message={failed} onRetry={() => (setFailed(null), void load())} />;
  if (ended) return <Ending tally={ended.tally} story={ended.story} next={loaded ? loaded.batch : null} api={api} onMore={keepGoing} />;
  if (!loaded) return <p>Loading…</p>;
  if (started) return <Session batch={loaded.batch} api={api} now={false} onFinished={finished} />;
  return <StartPage state={loaded.state} batch={loaded.batch} filter={level} onTracks={(t) => void saveTracks(t)} onStart={() => start(loaded.batch)} />;
};
