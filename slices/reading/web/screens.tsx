import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { StudyItemId } from "@ibbun/shared";
import { State, useLevelFilter } from "@ibbun/ui";
import type { EpisodeLists, TextView } from "../contract.ts";
import { loadBatchText, loadEpisodes, loadPassage, lookUp } from "./api.ts";
import { EpisodeList } from "./EpisodeList.tsx";
import { TextReader } from "./TextReader.tsx";

type Loaded<T> = { state: "loading" } | { state: "failed"; retry: () => void } | { state: "ready"; value: T };

/** Loads once per key, and again on a failed load's retry. */
export const useLoaded = <T,>(load: () => Promise<T>, key: string): Loaded<T> => {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ id: string; result: Loaded<T> } | null>(null);
  const id = `${key}#${attempt}`;
  useEffect(() => {
    let live = true;
    const retry = () => setAttempt((n) => n + 1);
    load().then(
      (value) => live && setLoaded({ id, result: { state: "ready", value } }),
      () => live && setLoaded({ id, result: { state: "failed", retry } }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  return loaded?.id === id ? loaded.result : { state: "loading" };
};

/** What was loaded, or that it is loading, or a failed load with Try again. Inline inside a screen that has more to show. */
export const Shown = <T,>({ loaded, inline = false, children }: { loaded: Loaded<T>; inline?: boolean; children: (value: T) => React.ReactNode }) => {
  if (loaded.state === "ready") return <>{children(loaded.value)}</>;
  if (loaded.state === "loading") return <p role="status">Loading…</p>;
  return <State mark="読" heading={inline ? 3 : 2} inline={inline} title="This did not load" fact="Check your connection, then try again." onRetry={loaded.retry} />;
};

/** The Learner's episodes, of one level when the Level filter names one. */
export const EpisodesScreen = () => {
  const level = useLevelFilter();
  return <Shown<EpisodeLists> loaded={useLoaded(() => loadEpisodes(level), `episodes:${level}`)}>{(lists) => <EpisodeList lists={lists} />}</Shown>;
};

export const TextShown = ({ loaded }: { loaded: Loaded<TextView> }) => (
  <Shown loaded={loaded}>{(text) => <TextReader text={text} onLookup={(wordId) => lookUp({ wordId: StudyItemId.parse(wordId) })} />}</Shown>
);

export const BatchTextScreen = () => {
  const { id = "" } = useParams();
  return <TextShown loaded={useLoaded(() => loadBatchText(id), `batch:${id}`)} />;
};

export const PassageScreen = () => {
  const { id = "" } = useParams();
  return <TextShown loaded={useLoaded(() => loadPassage(id), `passage:${id}`)} />;
};
