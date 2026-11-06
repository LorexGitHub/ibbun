import { z } from "zod";

/** What to say and how: everything a re-render needs, so the same request always gives the same audio. */
export const SpeechRequest = z.object({
  /**
   * The approved reading in AquesTalk-style kana, as VOICEVOX's `kana` field writes it: katakana,
   * `'` after each accent nucleus, `/` or `、` between accent phrases. Example: `ネ'コガ/タベマ'シタ`.
   */
  kana: z.string().min(1),
  /** A VOICEVOX style id. Which voices may be used is the caller's allow-list. */
  voice: z.number().int().nonnegative(),
  /** Speaking rate, 1 is normal. VOICEVOX accepts 0.5 to 2. */
  speed: z.number().min(0.5).max(2),
});
export type SpeechRequest = z.input<typeof SpeechRequest>;

export const OPUS_MIME_TYPE = "audio/ogg; codecs=opus";

export interface Tts {
  /** Synthesises the kana as an Ogg Opus file. Rejects a malformed request or kana the engine cannot read. */
  synthesise(request: SpeechRequest): Promise<Uint8Array>;
  /** The engine's version, part of an audio file's storage key. */
  engineVersion(): Promise<string>;
}

/** The engine refused the request or failed. */
export class TtsError extends Error {
  override readonly name = "TtsError";
}
