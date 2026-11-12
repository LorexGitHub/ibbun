import { useEffect, useState } from "react";
import { Button, buttonClass, Card } from "@mojibun/ui";
import { JLPT_LEVELS, type JlptLevel } from "@mojibun/shared";
import type { ClipView } from "../contract.ts";
import { listClips, loadClip } from "./api.ts";
import { PracticeTexts } from "../practice/web/PracticeTexts.tsx";
import { ClipCard } from "./ClipCard.tsx";

/** A level without clips: why, and Reading as the other way to practise at that level. */
const NoClips = ({ level }: { level: JlptLevel }) => (
  <>
    <p>No {level} clips yet. Pick another level above, or read at your level instead.</p>
    <a className={buttonClass()} href="/reading">
      Open Reading
    </a>
  </>
);

/** Walks through the clips of a level, one at a time, and starts over at the end. */
const Session = ({ level }: { level: JlptLevel }) => {
  const [clipIds, setClipIds] = useState<string[] | null>(null);
  const [at, setAt] = useState(0);
  const [view, setView] = useState<ClipView | null>(null);

  useEffect(() => {
    listClips(level).then((list) => setClipIds(list.clipIds));
  }, [level]);

  const id = clipIds?.[at % clipIds.length];
  useEffect(() => {
    setView(null);
    if (id) loadClip(id).then(setView);
  }, [id, at]);

  if (clipIds === null) return <p>Loading…</p>;
  if (clipIds.length === 0) return <NoClips level={level} />;
  return view ? <ClipCard key={`${at}`} view={view} onNext={() => setAt(at + 1)} /> : <p>Loading…</p>;
};

/** Free Listening practice: pick a level, hear its clips, answer. Logged as `cram`. */
export const ListeningPractice = () => {
  const [level, setLevel] = useState<JlptLevel | null>(null);
  return (
    <>
    <Card>
      <h1>Listening practice</h1>
      <div role="group" aria-label="Level">
        {JLPT_LEVELS.map((l) => (
          <Button key={l} variant={l === level ? "primary" : "secondary"} aria-pressed={l === level} onClick={() => setLevel(l)}>
            {l}
          </Button>
        ))}
      </div>
      {level && <Session key={level} level={level} />}
    </Card>
    <PracticeTexts />
    </>
  );
};
