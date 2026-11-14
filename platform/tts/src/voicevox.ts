import { z } from "zod";
import { SpeechRequest, TtsError, type Tts } from "./tts.ts";
import { encodeOggOpus } from "./ogg-opus.ts";
import { readWav } from "./wav.ts";
import { createIamFetch, credentialsFromEnv, functionUrlRegion } from "./iam-fetch.ts";

/** VOICEVOX's own defaults for everything the request does not set, as its /audio_query returns them. */
const QUERY_DEFAULTS = {
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  pauseLength: null,
  pauseLengthScale: 1,
  outputSamplingRate: 24_000,
  outputStereo: false,
};

export type VoicevoxOptions = {
  /** Base URL of the engine: a local one such as http://localhost:50021, or the VOICEVOX Lambda's function URL. */
  readonly url: string;
  readonly fetch?: typeof fetch;
  /** Where a function URL's credentials come from; the Lambda runtime's environment by default. */
  readonly env?: Record<string, string | undefined>;
};

/** A function URL is called with IAM auth, signed with the caller's own role (ADR 0015); a local engine takes plain calls. */
const transport = ({ url, fetch: send = fetch, env = process.env }: VoicevoxOptions): typeof fetch => {
  const region = functionUrlRegion(url);
  return region ? createIamFetch({ credentials: credentialsFromEnv(env), region, service: "lambda" }, send) : send;
};

/** The VOICEVOX ENGINE client. It sends the approved kana, never raw text, so the engine's own reading guesses never apply. */
export const createVoicevoxTts = (options: VoicevoxOptions): Tts => {
  const { url } = options;
  const send = transport(options);
  const call = async (path: string, params: Record<string, string>, init: RequestInit = {}) => {
    const target = new URL(path, url);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
    const response = await send(target, init);
    if (!response.ok) throw new TtsError(`VOICEVOX ${path} answered ${response.status}: ${await response.text()}`);
    return response;
  };

  return {
    async synthesise(request) {
      const { kana, voice, speed } = SpeechRequest.parse(request);
      const speaker = String(voice);
      const phrases = await call("/accent_phrases", { text: kana, speaker, is_kana: "true" }, { method: "POST" });
      const query = { ...QUERY_DEFAULTS, accent_phrases: await phrases.json(), speedScale: speed, kana };
      const wav = await call(
        "/synthesis",
        { speaker },
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) },
      );
      return encodeOggOpus(readWav(new Uint8Array(await wav.arrayBuffer())));
    },
    async engineVersion() {
      return z.string().parse(await (await call("/version", {})).json());
    },
  };
};
