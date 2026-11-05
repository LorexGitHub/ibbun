import { z } from "zod";

/** An ISO 8601 instant, always with an offset, kept as a string on the wire. */
export const Timestamp = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;
