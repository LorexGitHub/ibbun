import { Button } from "@mojibun/ui";
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
            <li key={face.id} className="card face">
              <strong className="jp" lang="ja">
                {face.title}
              </strong>
              <span className="muted small">{face.type}</span>
            </li>
          ))}
        </ul>
        <Button variant="primary" big onClick={onStart}>
          Start
        </Button>
      </>
    ) : (
      <p>Nothing new is left at this level. Choose another level or type above.</p>
    )}
  </section>
);
