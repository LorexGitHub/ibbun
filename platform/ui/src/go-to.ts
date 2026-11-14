// Any screen can open the shell's command menu without knowing the shell: it raises this event, the shell listens.
const EVENT = "ibbun:go-to";

export const openGoTo = () => window.dispatchEvent(new Event(EVENT));

export const onGoTo = (open: () => void) => {
  window.addEventListener(EVENT, open);
  return () => window.removeEventListener(EVENT, open);
};
