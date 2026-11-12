import { useLayoutEffect, useRef } from "react";

/** What a key press tells the kit: which key, where it landed, and what else was held. */
export type Press = Pick<KeyboardEvent, "key" | "target" | "isComposing" | "repeat" | "ctrlKey" | "metaKey" | "altKey">;

const within = (target: EventTarget | null, selector: string) => target instanceof Element && target.closest(selector) !== null;

const held = (press: Press) => press.repeat || press.ctrlKey || press.metaKey || press.altKey;

/** Enter stays with a control that takes it for itself. Every other key stays with a field that is being typed in. */
const freeAt = (key: string, target: EventTarget | null) =>
  key === "Escape" || !within(target, key === "Enter" ? "button, a, summary" : "input, textarea, select, [contenteditable]");

/**
 * Whether a key press may run a session key. Never while Japanese input is being composed, never as part of a
 * chord or a held key, and never under an open dialog. In a text field only Enter and Esc run.
 */
export const keyRuns = (press: Press): boolean =>
  !press.isComposing && !held(press) && !within(press.target, "[role=dialog]") && freeAt(press.key, press.target);

/**
 * Runs `act` when the Learner presses `key` anywhere on the screen. No key, no listening.
 * A layout effect, so the key listens as soon as its control is on the page: a plain effect waits for the browser to idle.
 */
export const useKey = (key: string | undefined, act: () => void) => {
  const latest = useRef(act);
  latest.current = act;
  useLayoutEffect(() => {
    if (!key) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== key || !keyRuns(event)) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key]);
};

const MARKS: Record<string, string> = { Enter: "↵", Escape: "Esc" };

/** The small mark on a control that says which key presses it. Screen readers get `aria-keyshortcuts` instead. */
export const KeyMark = ({ of }: { of: string }) => (
  <kbd className="key-mark" aria-hidden="true">
    {MARKS[of] ?? of}
  </kbd>
);
