import { SpeechRequest, type Tts } from "./tts.ts";
import { encodeOggOpus } from "./ogg-opus.ts";

const RATE = 24_000;
const SECONDS_PER_KANA = 0.1;

export interface FakeTts extends Tts {
  /** Every request synthesised so far, oldest first. */
  requests(): SpeechRequest[];
}

/**
 * A deterministic stand-in for VOICEVOX. It returns a real Ogg Opus file of
 * silence, 0.1 s per kana character divided by the speed. What was asked for
 * is in `requests()`.
 */
export const createFakeTts = (version = "fake-1.0.0"): FakeTts => {
  const seen: SpeechRequest[] = [];
  return {
    async synthesise(request) {
      const { kana, voice, speed } = SpeechRequest.parse(request);
      seen.push({ kana, voice, speed });
      const samples = new Int16Array(Math.round((kana.length * SECONDS_PER_KANA * RATE) / speed));
      return encodeOggOpus({ sampleRate: RATE, samples });
    },
    async engineVersion() {
      return version;
    },
    requests: () => [...seen],
  };
};
