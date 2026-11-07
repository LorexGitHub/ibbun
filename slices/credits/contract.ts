import { z } from "zod";

/** One line of the Credits page: a source (or a `VOICEVOX:<character>`) with its licence, link and live version. */
export const CreditEntry = z.object({
  name: z.string(),
  licenceName: z.string(),
  url: z.url(),
  version: z.string().nullable(),
  appliedAt: z.iso.datetime().nullable(),
});
export type CreditEntry = z.infer<typeof CreditEntry>;

/** `GET /api/credits`. Public. */
export const CreditsResponse = z.object({ credits: z.array(CreditEntry) });
export type CreditsResponse = z.infer<typeof CreditsResponse>;
