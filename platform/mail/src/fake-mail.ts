import type { Mail } from "./mail.ts";
import type { Message } from "./templates.ts";

export interface FakeMail extends Mail {
  /** Every mail sent so far, oldest first. */
  sent(): Message[];
  /** The newest mail sent to `to`. */
  last(to: string): Message | undefined;
}

export const createFakeMail = (): FakeMail => {
  const sent: Message[] = [];
  return {
    async send(message) {
      sent.push(message);
    },
    sent: () => [...sent],
    last: (to) => sent.findLast((m) => m.to === to),
  };
};
