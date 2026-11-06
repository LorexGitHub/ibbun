import { useRef, useState } from "react";

/** A card-stock button that plays and pauses one clip. `label` names the clip for screen readers. */
export const AudioPlayer = ({ src, label }: { src: string; label: string }) => {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const verb = playing ? "Pause" : "Play";
  const toggle = () => {
    const clip = audio.current as HTMLAudioElement;
    if (playing) clip.pause();
    // A refused play (an autoplay policy, a missing file) leaves the button on Play; there is nothing to undo.
    else clip.play().catch(() => {});
  };
  return (
    <span className="audio">
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button type="button" className="btn" aria-pressed={playing} aria-label={`${verb} ${label}`} onClick={toggle}>
        {verb}
      </button>
    </span>
  );
};
