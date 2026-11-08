import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { StudyItemId } from "@mojibun/shared";
import type { EpisodeLists, TextView } from "../contract.ts";
import { loadBatchText, loadEpisodes, loadPassage, lookUp } from "./api.ts";
import { EpisodeList } from "./EpisodeList.tsx";
import { TextReader } from "./TextReader.tsx";

type Loaded<T> = { state: "loading" } | { state: "failed" } | { state: "ready"; value: T };

export const useLoaded = <T,>(load: () => Promise<T>, key: string): Loaded<T> => {
  const [loaded, setLoaded] = useState<{ key: string; result: Loaded<T> } | null>(null);
  useEffect(() => {
    let live = true;
    load().then(
      (value) => live && setLoaded({ key, result: { state: "ready", value } }),
      () => live && setLoaded({ key, result: { state: "failed" } }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return loaded?.key === key ? loaded.result : { state: "loading" };
};

export const Shown = <T,>({ loaded, children }: { loaded: Loaded<T>; children: (value: T) => React.ReactNode }) =>
  loaded.state === "ready" ? <>{children(loaded.value)}</> : <p role="status">{loaded.state === "loading" ? "Loading…" : "Reading could not load this."}</p>;

export const EpisodesScreen = () => (
  <Shown<EpisodeLists> loaded={useLoaded(loadEpisodes, "episodes")}>{(lists) => <EpisodeList lists={lists} />}</Shown>
);

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
