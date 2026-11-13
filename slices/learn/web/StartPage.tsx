import { Button, buttonClass } from "@ibbun/ui";
import type { Batch, State, Track } from "../contract.ts";
import { faceOf } from "./batch-view.ts";
import { SourceChooser } from "./SourceChooser.tsx";

type Props = { state: State; batch: Batch; onTracks: (tracks: Track[]) => void; onStart: () => void };

/** Where a batch starts: what Learn draws from, the Study Items that come next, and one button. */
export const StartPage = ({ state, batch, onTracks, onStart }: Props) => (
  <section className="learn-start">
    <h1>Learn</h1>
    <SourceChooser tracks={state.activeTracks} onChange={onTracks} />
    {batch.items[0] ? (
      <>
        <ul aria-label="Next up" className="face-list">
          {batch.items.map(faceOf).map((face) => (
            <li key={face.id} className="face">
              <strong className="jp" lang="ja">
                {face.title}
              </strong>
              <span className="caps">{face.type}</span>
            </li>
          ))}
        </ul>
        <Button variant="primary" big hotkey="Enter" onClick={onStart}>
          Start
        </Button>
      </>
    ) : (
      <>
        <p className="learn-empty">Nothing new is left at this level. Choose another level or type above, or keep what you learned fresh.</p>
        <a className={buttonClass()} href="/reviews">
          Start Reviews
        </a>
      </>
    )}
  </section>
);
