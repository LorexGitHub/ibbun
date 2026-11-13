import type { ReactNode } from "react";
import { Button } from "./paper.tsx";

type StateProps = {
  title: ReactNode;
  /** The heading level: 1 when the state is the whole screen, 3 inside a section. */
  heading?: 1 | 2 | 3;
  /** One large Mincho mark above the heading, faint: the place's glyph. Inline states leave it out. */
  mark?: string;
  /** A result's score, drawn in ink where the mark would be. */
  score?: { right: number; of: number };
  label?: ReactNode;
  fact?: ReactNode;
  note?: ReactNode;
  /** A part of a screen, such as an empty list, rather than the whole of it. */
  inline?: boolean;
  /** Makes the state a failed load: an alert labelled "Not loaded" that offers Try again. */
  onRetry?: () => void;
  children?: ReactNode;
};

/** The large mark above a whole-screen state: a result's score in ink, or the place's glyph. */
const Mark = ({ mark, score }: Pick<StateProps, "mark" | "score">) => {
  if (score) {
    return (
      <div className="state-mark state-mark--score jp" aria-hidden="true">
        {score.right}
        <small> / {score.of}</small>
      </div>
    );
  }
  return mark ? <div className="state-mark jp" aria-hidden="true">{mark}</div> : null;
};

const Actions = ({ inline, onRetry, children }: Pick<StateProps, "inline" | "onRetry" | "children">) => {
  if (!onRetry && !children) return null;
  return (
    <div className="state-actions">
      {onRetry && <Button variant={inline ? "secondary" : "primary"} onClick={onRetry}>Try again</Button>}
      {children}
    </div>
  );
};

const classOf = (inline: boolean, failed: boolean) =>
  ["state", inline && "state--inline", failed && "state--error"].filter(Boolean).join(" ");

/** A result, an empty place or a failed load, centred under the screen's heading (#239). */
export const State = ({ title, heading = 2, mark, score, label, fact, note, inline = false, onRetry, children }: StateProps) => {
  const Heading = `h${heading}` as const;
  const failed = onRetry !== undefined;
  const caption = label ?? (failed ? "Not loaded" : undefined);
  return (
    <section className={classOf(inline, failed)} role={failed ? "alert" : undefined}>
      {!inline && <Mark mark={mark} score={score} />}
      {caption && <p className="caps state-label">{caption}</p>}
      <Heading>{title}</Heading>
      {fact && <p className="state-fact">{fact}</p>}
      {note && <p className="state-note">{note}</p>}
      <Actions inline={inline} onRetry={onRetry}>{children}</Actions>
    </section>
  );
};
