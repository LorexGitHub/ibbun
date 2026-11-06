import type { Message } from "./templates.ts";

/** Sends a named template with its data. Real mail goes over SMTP; tests use the fake. */
export interface Mail {
  send(message: Message): Promise<void>;
}
