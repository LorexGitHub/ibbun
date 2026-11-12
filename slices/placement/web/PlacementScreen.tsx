import { useCallback, useEffect, useState } from "react";
import { useLevelFilter } from "@mojibun/ui";
import { PlacementList, PlacementResult, type JlptLevel } from "../contract.ts";
import { PlacementView, type Track } from "./PlacementView.tsx";

/** Adds `ids` to what is tapped, or takes them all out when every one of them already is. */
const flipped = (ticked: ReadonlySet<string>, ids: string[]): ReadonlySet<string> => {
  const next = new Set(ticked);
  const all = ids.every((id) => next.has(id));
  for (const id of ids) all ? next.delete(id) : next.add(id);
  return next;
};

export const PlacementScreen = () => {
  const filter = useLevelFilter();
  const [picked, setLevel] = useState<JlptLevel>("N5");
  const level = filter ?? picked;
  const [track, setTrack] = useState<Track>("kanji");
  const [list, setList] = useState<PlacementList | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (l: JlptLevel) => {
    const res = await fetch(`/api/placement/${l}`);
    if (res.ok) setList(PlacementList.parse(await res.json()));
    else setMessage(res.status === 401 ? "Log in to use Placement." : "Placement could not load this level.");
  }, []);

  useEffect(() => {
    setList(null);
    setTicked(new Set());
    setMessage(null);
    void load(level);
  }, [level, load]);

  const toggle = (id: string) => setTicked((prev) => flipped(prev, [id]));
  const tickAll = () => setTicked((prev) => flipped(prev, list!.items.filter((item) => item.type === track && !item.known).map((item) => item.id)));

  const submit = async () => {
    const res = await fetch(`/api/placement/${level}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studyItemIds: [...ticked] }),
    });
    if (!res.ok) return setMessage("Placement could not save your ticks.");
    const { recorded } = PlacementResult.parse(await res.json());
    setTicked(new Set());
    setMessage(`${recorded} marked as Known.`);
    await load(level);
  };

  return (
    <PlacementView level={level} track={track} list={list} ticked={ticked} message={message} onLevel={filter ? undefined : setLevel} onTrack={setTrack} onToggle={toggle} onAll={tickAll} onSubmit={submit} />
  );
};
