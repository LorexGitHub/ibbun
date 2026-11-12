import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SLOT = "session-count";

/** Where the frame's header shows how far a session is. */
export const SessionCountSlot = () => <span id={SLOT} className="session-count" />;

/**
 * How far a session is, as "2 / 5". A session screen renders it anywhere;
 * it shows in the frame's header when there is one, and in place when there is not.
 */
export const SessionCount = ({ at, of }: { at: number; of: number }) => {
  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => setSlot(document.getElementById(SLOT)), []);
  const count = (
    <>
      {at} / {of}
    </>
  );
  return slot ? createPortal(count, slot) : count;
};
