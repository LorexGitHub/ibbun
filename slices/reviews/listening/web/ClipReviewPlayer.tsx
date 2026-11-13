import { useState } from "react";
import { Button } from "@ibbun/ui";

/** Slow speed is `playbackRate` 0.75 with the pitch kept, so there is no second file (listening.md#playback). */
export const SLOW_RATE = 0.75;

const playOne = (src: string, rate: number) =>
  new Promise<void>((done) => {
    const audio = new Audio(src);
    audio.playbackRate = rate;
    audio.onended = () => done();
    audio.onerror = () => done();
    // A refused play (an autoplay policy, a missing file) ends the line; there is nothing to undo.
    audio.play().catch(() => done());
  });

type Props = {
  audio: { src: string }[];
  /** Exam Mode: the clip plays once, with no replay and no slow speed. */
  examMode: boolean;
  slowAudio: boolean;
  /** Called as each play starts, with whether it is slow. */
  onPlay: (slow: boolean) => void;
};

const SlowToggle = ({ slow, onChange }: { slow: boolean; onChange: (slow: boolean) => void }) => (
  <label>
    <input type="checkbox" checked={slow} onChange={(e) => onChange(e.target.checked)} /> Slow (0.75×)
  </label>
);

/** Exam Mode: the clip plays once, so there is only ever "Play". Otherwise the button becomes "Replay". */
const labelOf = (examMode: boolean, plays: number) => (examMode || plays === 0 ? "Play" : "Replay");

/** Plays a clip's lines in order. Replays are unlimited unless Exam Mode is on. */
export const ClipReviewPlayer = ({ audio, examMode, slowAudio, onPlay }: Props) => {
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(!examMode && slowAudio);

  const play = async () => {
    setPlaying(true);
    setPlays((n) => n + 1);
    onPlay(slow);
    for (const line of audio) await playOne(line.src, slow ? SLOW_RATE : 1);
    setPlaying(false);
  };

  const spent = examMode && plays > 0;
  return (
    <div className="clip-player">
      <Button variant="primary" big disabled={playing || spent} onClick={play}>
        {labelOf(examMode, plays)}
      </Button>
      {!examMode && <SlowToggle slow={slow} onChange={setSlow} />}
      {spent && <span>Played once</span>}
    </div>
  );
};
