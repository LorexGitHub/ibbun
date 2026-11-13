import { useEffect, useState } from "react";
import { buttonClass, pillClass, useLevelFilter } from "@ibbun/ui";
import { JLPT_LEVELS, type JlptLevel } from "@ibbun/shared";
import type { ClipView } from "../contract.ts";
import { listClips, loadClip, RequestFailed } from "./api.ts";
import { PracticeTexts } from "../practice/web/PracticeTexts.tsx";
import { ClipCard } from "./ClipCard.tsx";
import "./listening.css";

/** A level without clips: why, and Reading as the other way to practise at that level. */
const NoClips = ({ level }: { level: JlptLevel }) => (
  <>
    <p>No {level} clips yet. Pick another level, or read at your level instead.</p>
    <a className={buttonClass()} href="/reading">
      Open Reading
    </a>
  </>
);

/** Walks through the clips of a level, one at a time, and starts over at the end. There is no list to pick from. */
const Session = ({ level }: { level: JlptLevel }) => {
  const [clipIds, setClipIds] = useState<string[] | null>(null);
  const [at, setAt] = useState(0);
  const [view, setView] = useState<ClipView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    listClips(level).then((list) => setClipIds(list.clipIds), () => setFailed(true));
  }, [level]);

  const id = clipIds?.[at % clipIds.length];
  useEffect(() => {
    setView(null);
    // A clip that cannot be served (it has no question yet) is left out, so the Learner only meets clips they can answer.
    if (id) {
      loadClip(id).then(setView, (e) => {
        // Only a 404 means this clip cannot be served; any other failure says nothing about the clip.
        if (e instanceof RequestFailed && e.status === 404) setClipIds((ids) => ids!.filter((other) => other !== id));
        else setFailed(true);
      });
    }
  }, [id, at]);

  if (failed) return <p role="alert">Listening could not load clips. Try again in a moment.</p>;
  if (clipIds === null) return <p>Loading…</p>;
  if (clipIds.length === 0) return <NoClips level={level} />;
  return view ? <ClipCard key={`${at}`} view={view} onNext={() => setAt(at + 1)} /> : <p>Loading…</p>;
};

const LevelPicker = ({ level, onPick }: { level: JlptLevel; onPick: (level: JlptLevel) => void }) => (
  <div role="group" aria-label="Level" className="listening-levels">
    {JLPT_LEVELS.map((l) => (
      <button key={l} type="button" className={pillClass(l === level)} aria-pressed={l === level} onClick={() => onPick(l)}>
        {l}
      </button>
    ))}
  </div>
);

/**
 * Free Listening practice: the player is the screen. The Level filter picks the level when it names one, otherwise
 * the Learner does, starting at N5. Answers are logged as `cram`. A Practice Text dialogue takes the screen while it plays.
 */
export const ListeningPractice = () => {
  const filter = useLevelFilter();
  const [picked, setLevel] = useState<JlptLevel>("N5");
  const [dialogue, setDialogue] = useState(false);
  const level = filter ?? picked;
  return (
    <>
      <section aria-labelledby="listening-title" className="listening" hidden={dialogue}>
        <h1 id="listening-title">Listening</h1>
        {!filter && <LevelPicker level={level} onPick={setLevel} />}
        {!dialogue && <Session key={level} level={level} />}
      </section>
      <PracticeTexts onPlaying={setDialogue} />
    </>
  );
};
