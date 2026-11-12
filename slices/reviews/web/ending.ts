/** How a session went: the scheduled Reviews answered, and how many of them right. */
export type Tally = { done: number; right: number };

export const tallied = (tally: Tally, passed: boolean): Tally => ({ done: tally.done + 1, right: passed ? tally.right + 1 : tally.right });

const two = (n: number) => String(n).padStart(2, "0");

/** The one line of fact when nothing is due: until when, in the Learner's own time. Null when nothing is scheduled. */
export const clearUntil = (nextDue: string | null | undefined, now: Date): string | null => {
  if (!nextDue) return null;
  const at = new Date(nextDue);
  const time = `${two(at.getHours())}:${two(at.getMinutes())}`;
  const day = `${at.toLocaleString("en", { month: "short" })} ${at.getDate()}, `;
  return `Clear until ${at.toDateString() === now.toDateString() ? "" : day}${time}`;
};

/** A way on from the end of a session. */
export type Door = { href: string; label: string; note: string };

const LEARN: Door = { href: "/learn", label: "Learn", note: "New Study Items" };
const READING: Door = { href: "/reading", label: "Reading", note: "Stories from what you know" };
const LISTENING: Door = { href: "/listening", label: "Listening", note: "Clips at your level" };

/** The three doors at the end. After a Lapse the first is Cram on exactly the Study Items of this session's Lapses. */
export const doorsAfter = (lapses: string[]): Door[] =>
  lapses.length
    ? [{ href: `/cram?items=${lapses.join(",")}`, label: "Cram the Lapses", note: `${lapses.length} from this session` }, LEARN, READING]
    : [LEARN, READING, LISTENING];
