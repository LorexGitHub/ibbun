import { z } from "zod";
import type { Nlp, Token } from "./nlp.ts";

const UNSET = "*";

/** Sudachi's six part-of-speech fields: four POS levels, then 活用型 and 活用形, with "*" for unused ones. */
const SidecarToken = z
  .object({
    surface: z.string(),
    lemma: z.string(),
    reading: z.string(),
    pos: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string(), z.string()]),
  })
  .transform(
    ({ pos, ...rest }): Token => ({
      ...rest,
      partOfSpeech: pos.slice(0, 4).filter((level) => level !== UNSET),
      conjugation: pos[4] === UNSET ? null : { type: pos[4], form: pos[5] },
    }),
  );

const SidecarResponse = z.object({ tokens: z.array(SidecarToken) });

/** The Sudachi sidecar (docker/sudachi) answered with something other than tokens. */
export class NlpError extends Error {
  override readonly name = "NlpError";
}

export type SudachiOptions = {
  /** Base URL of the sidecar, e.g. http://localhost:8000. */
  readonly url: string;
  readonly fetch?: typeof fetch;
};

/** The Sudachi sidecar client. */
export const createSudachiNlp = ({ url, fetch: send = fetch }: SudachiOptions): Nlp => ({
  async tokenize(text) {
    const response = await send(new URL("/tokenize", url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new NlpError(`Sudachi sidecar answered ${response.status}: ${await response.text()}`);
    return SidecarResponse.parse(await response.json()).tokens;
  },
});
