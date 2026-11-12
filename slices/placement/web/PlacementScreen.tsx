import { useCallback, useEffect, useState } from "react";
import { useLevelFilter } from "@mojibun/ui";
import { PlacementList, PlacementResult, type JlptLevel } from "../contract.ts";
import { PlacementView } from "./PlacementView.tsx";

export const PlacementScreen = () => {
  const filter = useLevelFilter();
  const [picked, setLevel] = useState<JlptLevel>("N5");
  const level = filter ?? picked;
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

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

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
    <PlacementView level={level} list={list} ticked={ticked} message={message} onLevel={filter ? undefined : setLevel} onToggle={toggle} onSubmit={submit} />
  );
};
