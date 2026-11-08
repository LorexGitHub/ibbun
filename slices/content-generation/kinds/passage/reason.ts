import type { z } from "zod";

/**
 * Carries a kind's context on the Generation Request's `reason`, from the job that opened it to every attempt:
 * the prefix, then the context as JSON.
 */
export const reasonCodec = <S extends z.ZodType>(prefix: string, schema: S) => ({
  reasonOf: (context: z.output<S>): string => prefix + JSON.stringify(context),
  /** The context a request was opened with, or null if its reason is not this kind's. */
  contextOf: (reason: string): z.output<S> | null => {
    if (!reason.startsWith(prefix)) return null;
    try {
      return schema.parse(JSON.parse(reason.slice(prefix.length)));
    } catch {
      return null;
    }
  },
});
