import { useState } from "react";
import { Button, pillClass } from "@mojibun/ui";

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
  /** Exam Mode: the clip plays once, with no "Again" and no slow speed. */
  examMode: boolean;
  slowAudio: boolean;
  /** Called as each play starts, with whether it is slow. */
  onPlay: (slow: boolean) => void;
};

const SPEEDS = [
  { label: "1×", slow: false },
  { label: "0.75×", slow: true },
];

const Speed = ({ slow, onChange }: { slow: boolean; onChange: (slow: boolean) => void }) => (
  <div role="group" aria-label="Speed" className="player-speed">
    {SPEEDS.map((speed) => (
      <button key={speed.label} type="button" className={pillClass(speed.slow === slow)} aria-pressed={speed.slow === slow} onClick={() => onChange(speed.slow)}>
        {speed.label}
      </button>
    ))}
  </div>
);

/** The sound as bars: still until the clip plays. Drawn only; a screen reader has the Play button. */
const Sound = () => (
  <div className="player-sound" aria-hidden="true">
    {Array.from({ length: 9 }, (_, i) => (
      <i key={i} />
    ))}
  </div>
);

/** The large play button, the sound, the speed and "Again". Plays a clip's lines in order. */
export const ClipPlayer = ({ audio, examMode, slowAudio, onPlay }: Props) => {
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
    <div className="player" data-playing={playing}>
      <button type="button" className="player-play" aria-label="Play" disabled={playing || spent} onClick={play}>
        <span aria-hidden="true">▶</span>
      </button>
      <Sound />
      {spent && <p>Played once</p>}
      {!examMode && (
        <div className="player-controls">
          <Speed slow={slow} onChange={setSlow} />
          <Button disabled={playing || plays === 0} onClick={play}>
            Again
          </Button>
        </div>
      )}
    </div>
  );
};
