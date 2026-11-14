import { useState } from "react";
import { Button, buttonClass, Pill } from "@ibbun/ui";
import { isShowcase, SHOWCASE_NO_TEXTS } from "@ibbun/shared";
import type { Batch } from "../contract.ts";
import type { Tally } from "./batch-view.ts";
import type { LearnApi } from "./learn-client.ts";
import { ReadingStep } from "./ReadingStep.tsx";

// The root typecheck has no Vite types, so `import.meta.env` is read through a cast-free ignore.
// @ts-ignore
const showcase = () => isShowcase(import.meta.env?.VITE_SHOWCASE);

type Props ={ tally: Tally; onMore: (() => void) | null; onStory: (() => void) | null };

/** How a batch ended: the count, each item with its mark, and what to do next. The next batch is one button away. */
export const TallyScreen = ({ tally, onMore, onStory }: Props) => (
  <section className="tally">
    <h1>
      <strong className="tally-count">{tally.learned}</strong> learned
    </h1>
    <ul aria-label="This batch" className="tally-list">
      {tally.items.map((item) => (
        <li key={item.id}>
          <span className="jp" lang="ja">
            {item.title}
          </span>
          <span className="muted small">{item.type}</span>
          <Pill>{item.known ? "Known" : "Learned"}</Pill>
        </li>
      ))}
    </ul>
    {showcase() && <p role="status">{SHOWCASE_NO_TEXTS}</p>}
    <div className="tally-doors">
      {onMore ? (
        <Button variant="primary" big hotkey="Enter" onClick={onMore}>
          Keep going
        </Button>
      ) : (
        <Button variant="primary" big disabled>
          Keep going
        </Button>
      )}
      {onStory && <Button onClick={onStory}>Read the story</Button>}
      <a className={buttonClass()} href="/">
        Done for now
      </a>
    </div>
  </section>
);

export type Story = { ids: string[] };
type EndingProps = { tally: Tally; story: Story | null; next: Batch | null; api: LearnApi; onMore: (batch: Batch) => void };

/** The Tally, with the batch's story to read from it once. `next` is the batch "Keep going" starts, when it is loaded. */
export const Ending = ({ tally, story, next, api, onMore }: EndingProps) => {
  const [offered, setOffered] = useState(story);
  const [reading, setReading] = useState<Story | null>(null);
  const read = () => {
    setReading(null);
    setOffered(null);
  };
  if (reading) return <ReadingStep api={api} ids={reading.ids} onDone={read} />;
  return <TallyScreen tally={tally} onMore={next ? () => onMore(next) : null} onStory={offered ? () => setReading(offered) : null} />;
};
