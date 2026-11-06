import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { opusSeconds, readOgg } from "../test/ogg.ts";
import { createFakeTts, createVoicevoxTts, TtsError, type SpeechRequest, type Tts } from "./index.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

/** ネコ, low-high, in VOICEVOX's kana notation. */
const NEKO: SpeechRequest = { kana: "ネ'コ", voice: 2, speed: 1 };

/** Behaviour every Tts shares. */
const ttsContract = (make: () => Tts) => {
  it("returns an Ogg Opus file", async () => {
    const pages = readOgg(await make().synthesise(NEKO));
    expect(pages[0]!.packets[0]!.toString("latin1", 0, 8)).toBe("OpusHead");
    expect(pages.every((page) => page.crcValid)).toBe(true);
  });

  it("returns the same bytes for the same request", async () => {
    const tts = make();
    expect(Buffer.from(await tts.synthesise(NEKO)).equals(Buffer.from(await tts.synthesise(NEKO)))).toBe(true);
  });

  it.each([
    ["empty kana", { ...NEKO, kana: "" }],
    ["a negative voice", { ...NEKO, voice: -1 }],
    ["a fractional voice", { ...NEKO, voice: 1.5 }],
    ["speed below 0.5", { ...NEKO, speed: 0.49 }],
    ["speed above 2", { ...NEKO, speed: 2.01 }],
  ])("rejects %s", async (_, request) => {
    await expect(make().synthesise(request)).rejects.toThrow();
  });

  it("names its engine version", async () => {
    expect(await make().engineVersion()).toMatch(/\d+\.\d+\.\d+/);
  });
};

describe("fake tts", () => {
  ttsContract(() => createFakeTts());

  it("gives 0.1 s per kana character, divided by the speed", async () => {
    const tts = createFakeTts();
    expect(opusSeconds(await tts.synthesise(NEKO))).toBe(0.3);
    expect(opusSeconds(await tts.synthesise({ ...NEKO, kana: "ネ'コガ", speed: 0.5 }))).toBe(0.8);
  });

  it("records each request and reports the version it was given", async () => {
    const tts = createFakeTts("9.9.9");
    await tts.synthesise({ ...NEKO, speed: 1.5 });
    expect(tts.requests()).toEqual([{ ...NEKO, speed: 1.5 }]);
    expect(await tts.engineVersion()).toBe("9.9.9");
  });
});

type Seen = { method: string; path: string; params: Record<string, string>; body: unknown };

/** Answers like VOICEVOX 0.24.1 did when these fixtures were recorded, and records each request. */
const replay = (failWith?: Response) => {
  const seen: Seen[] = [];
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ method: init.method ?? "GET", path: url.pathname, params: Object.fromEntries(url.searchParams), body });
    if (failWith) return failWith;
    const answers: Record<string, () => Response> = {
      "/version": () => Response.json("0.24.1"),
      "/accent_phrases": () => new Response(fixture("accent-phrases.json")),
      "/synthesis": () => new Response(fixture("neko.wav")),
    };
    return answers[url.pathname]!();
  };
  return { fetch: fetch as typeof globalThis.fetch, seen };
};

describe("VOICEVOX tts, replaying recorded answers", () => {
  ttsContract(() => createVoicevoxTts({ url: "http://voicevox.test", fetch: replay().fetch }));

  it("reads the kana as kana, then synthesises those accent phrases at the requested speed", async () => {
    const engine = replay();
    await createVoicevoxTts({ url: "http://voicevox.test:50021", fetch: engine.fetch }).synthesise({ ...NEKO, speed: 1.25 });
    const [phrases, synthesis] = engine.seen;
    expect(phrases).toEqual({
      method: "POST",
      path: "/accent_phrases",
      params: { text: "ネ'コ", speaker: "2", is_kana: "true" },
      body: undefined,
    });
    expect(synthesis).toMatchObject({ method: "POST", path: "/synthesis", params: { speaker: "2" } });
    expect(synthesis!.body).toEqual({
      accent_phrases: JSON.parse(fixture("accent-phrases.json").toString()),
      speedScale: 1.25,
      kana: "ネ'コ",
      pitchScale: 0,
      intonationScale: 1,
      volumeScale: 1,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.1,
      pauseLength: null,
      pauseLengthScale: 1,
      outputSamplingRate: 24_000,
      outputStereo: false,
    });
  });

  it("encodes the whole of the engine's WAV", async () => {
    const audio = await createVoicevoxTts({ url: "http://voicevox.test", fetch: replay().fetch }).synthesise(NEKO);
    expect(opusSeconds(audio)).toBe((27_180 - 44) / 2 / 24_000);
  });

  it("sends nothing for a malformed request", async () => {
    const engine = replay();
    await expect(createVoicevoxTts({ url: "http://voicevox.test", fetch: engine.fetch }).synthesise({ ...NEKO, kana: "" })).rejects.toThrow();
    expect(engine.seen).toEqual([]);
  });

  it("asks the engine for its version", async () => {
    const engine = replay();
    expect(await createVoicevoxTts({ url: "http://voicevox.test", fetch: engine.fetch }).engineVersion()).toBe("0.24.1");
    expect(engine.seen).toEqual([{ method: "GET", path: "/version", params: {}, body: undefined }]);
  });

  it("rejects with the engine's answer when it refuses the kana", async () => {
    const refusal = Response.json({ detail: { error_name: "ACCENT_NOTFOUND" } }, { status: 400 });
    const tts = createVoicevoxTts({ url: "http://voicevox.test", fetch: replay(refusal).fetch });
    const error = await tts.synthesise({ ...NEKO, kana: "ネコ" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TtsError);
    expect(error).toMatchObject({ name: "TtsError", message: expect.stringMatching(/^VOICEVOX \/accent_phrases answered 400: .*ACCENT_NOTFOUND/) });
  });
});

describe.runIf(process.env.VOICEVOX_URL)("VOICEVOX tts, against the engine at VOICEVOX_URL", () => {
  ttsContract(() => createVoicevoxTts({ url: process.env.VOICEVOX_URL! }));

  it("refuses kana without an accent mark", async () => {
    await expect(createVoicevoxTts({ url: process.env.VOICEVOX_URL! }).synthesise({ ...NEKO, kana: "ネコ" })).rejects.toThrow(TtsError);
  });
});
