import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CreateBucketCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createFakeAuthoring } from "@ibbun/content-graph/testing";
import { ListeningSynthesise } from "@ibbun/content-graph/jobs";
import { createFakeJobs } from "@ibbun/jobs";
import { createFakeTts } from "@ibbun/tts";
import { world } from "../../server/world.ts";
import { audioKeyOf, audioStoreAt, createDirectoryAudioStore, createMemoryAudioStore, createS3AudioStore, synthesiseHandlers, type AudioStore, type Voice } from "./index.ts";
import { kanaOf } from "./kana.ts";
import { dialogueVoices, loadSynthesisConfig, loadVoices, sentenceVoice } from "./voices.ts";

const VOICES: Voice[] = [
  { id: 11, character: "玄野武宏", speaker: "男" },
  { id: 13, character: "青山龍星", speaker: "男" },
  { id: 8, character: "春日部つむぎ", speaker: "女" },
  { id: 14, character: "冥鳴ひまり", speaker: "女" },
];

let at = 0;
const token = (surface: string, reading: string, partOfSpeech: string[]) => ({ surface, reading, lemma: surface, partOfSpeech, conjugationForm: null, start: at++, end: at });
/** 猫は魚を食べる。 */
const NEKO = [
  token("猫", "ネコ", ["名詞"]),
  token("は", "ハ", ["助詞", "係助詞"]),
  token("魚", "サカナ", ["名詞"]),
  token("を", "ヲ", ["助詞", "格助詞"]),
  token("食べる", "タベル", ["動詞"]),
  token("。", "", ["補助記号", "句点"]),
];
const NEKO_KANA = "ネコワ'/サカナオ'/タベル'";

type Target = { kind: "sentence"; sentenceId: string } | { kind: "dialogue"; passageId: string };

const setup = () => {
  const w = world();
  const auth = createFakeAuthoring(w.graph);
  const tts = createFakeTts("0.26.0");
  const store = createMemoryAudioStore();
  const jobs = createFakeJobs();
  const ready = jobs.work(synthesiseHandlers({ auth, tts, store, voices: VOICES }));
  const sentence = (tokens = NEKO, approval: "approved" | "draft" = "approved") => {
    const id = randomUUID();
    w.graph.sentence.push({ id, text: "猫は魚を食べる。", translationEn: null, tokens, audioKey: null, audioVoice: null, unlevelledWordCount: 0, ...w.life, approval });
    return id;
  };
  const run = async (target: Target) => {
    await ready;
    await jobs.enqueue(ListeningSynthesise, { target });
    await jobs.drain();
  };
  const row = async (id: string) => (await auth.rows("sentence", { id }))[0]!;
  return { ...w, auth, tts, store, jobs, sentence, run, row };
};

describe("the approved reading as kana", () => {
  it("writes particles as spoken, one accent phrase per word, and drops the full stop", () => {
    expect(kanaOf(NEKO)).toBe(NEKO_KANA);
  });

  it("pauses at a comma", () => {
    const tokens = [token("今日", "キョウ", ["名詞"]), token("、", "", ["補助記号", "読点"]), token("雨", "アメ", ["名詞"])];
    expect(kanaOf(tokens)).toBe("キョウ'、アメ'");
  });

  it("keeps a prefix and a suffix in the phrase they belong to", () => {
    const tokens = [token("お", "オ", ["接頭辞"]), token("茶", "チャ", ["名詞"]), token("さん", "サン", ["接尾辞"])];
    expect(kanaOf(tokens)).toBe("オチャサン'");
  });

  it.each([
    ["a token with no reading", [token("abc", "", ["名詞"])]],
    ["only punctuation", [token("。", "", ["補助記号"])]],
  ])("refuses %s", (_, tokens) => {
    expect(() => kanaOf(tokens)).toThrow();
  });
});

describe("voices", () => {
  it("picks a Sentence's voice by hash, always the same one, spread over the allow-list", () => {
    const id = randomUUID();
    expect(sentenceVoice(VOICES, id)).toBe(sentenceVoice(VOICES, id));
    const used = new Set(Array.from({ length: 80 }, () => sentenceVoice(VOICES, randomUUID()).id));
    expect(used.size).toBe(VOICES.length);
  });

  it("gives a dialogue a male-sounding and a female-sounding voice, which differ", () => {
    for (let i = 0; i < 20; i++) {
      const cast = dialogueVoices(VOICES, randomUUID());
      expect([cast.男.speaker, cast.女.speaker]).toEqual(["男", "女"]);
      expect(cast.男.id).not.toBe(cast.女.id);
    }
  });

  it("refuses an allow-list without a voice for one of the speakers", () => {
    expect(() => dialogueVoices(VOICES.filter((v) => v.speaker === "男"), randomUUID())).toThrow();
  });

  it("reads the allow-list from the environment and holds it to 4–6 voices with both sexes", () => {
    expect(loadVoices({ VOICE_ALLOW_LIST: JSON.stringify(VOICES) })).toEqual(VOICES);
    expect(() => loadVoices({ VOICE_ALLOW_LIST: JSON.stringify(VOICES.slice(0, 3)) })).toThrow();
    expect(() => loadVoices({ VOICE_ALLOW_LIST: JSON.stringify(VOICES.map((v) => ({ ...v, speaker: "男" }))) })).toThrow();
    expect(() => loadVoices({ VOICE_ALLOW_LIST: JSON.stringify([...VOICES, ...VOICES].slice(0, 7)) })).toThrow();
    expect(() => loadVoices({})).toThrow();
  });
});

describe("the worker's synthesis settings", () => {
  const env = { DATABASE_URL: "postgres://db", VOICEVOX_URL: "http://voicevox", AUDIO_DIR: "/audio", VOICE_ALLOW_LIST: JSON.stringify(VOICES) };

  it("reads the database, engine, audio directory and voices", () => {
    expect(loadSynthesisConfig(env)).toEqual({ databaseUrl: "postgres://db", voicevoxUrl: "http://voicevox", audioDir: "/audio", voices: VOICES });
  });

  it.each(["DATABASE_URL", "VOICEVOX_URL", "AUDIO_DIR"])("refuses to start without %s", (name) => {
    expect(() => loadSynthesisConfig({ ...env, [name]: "" })).toThrow("must be set");
  });
});

describe("the audio store", () => {
  it("keys speech by kana, voice, engine version and speed", () => {
    const spec = { kana: "ネ'コ", voice: 1, engineVersion: "0.26.0", speed: 1 };
    const key = audioKeyOf(spec);
    expect(audioKeyOf({ ...spec })).toBe(key);
    for (const other of [{ kana: "イ'ヌ" }, { voice: 2 }, { engineVersion: "0.26.1" }, { speed: 0.75 }]) expect(audioKeyOf({ ...spec, ...other })).not.toBe(key);
  });

});

const audioStoreContract = (make: () => Promise<AudioStore>) => {
  it("answers has and get for a key it never stored with false and null", async () => {
    const store = await make();
    expect(await store.has("k")).toBe(false);
    expect(await store.get("k")).toBeNull();
  });

  it("returns the bytes it was given, and the latest bytes for a key put twice", async () => {
    const store = await make();
    await store.put("k", new Uint8Array([1, 2, 3]));
    expect(await store.has("k")).toBe(true);
    expect([...(await store.get("k"))!]).toEqual([1, 2, 3]);
    await store.put("k", new Uint8Array([4]));
    expect([...(await store.get("k"))!]).toEqual([4]);
    expect(await store.has("other")).toBe(false);
  });
};

describe("the audio store in memory", () => audioStoreContract(async () => createMemoryAudioStore()));

describe("the audio store in a directory", () => {
  audioStoreContract(async () => createDirectoryAudioStore(join(await mkdtemp(join(tmpdir(), "audio-")), "nested")));

  it("is what a path in AUDIO_DIR names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "audio-"));
    await audioStoreAt(dir).put("k", new Uint8Array([7]));
    expect([...(await readFile(join(dir, "k")))]).toEqual([7]);
  });
});

// Runs against Compose's S3 (`docker compose up -d s3`) when TEST_S3_ENDPOINT is set, as in CI.
const endpoint = process.env.TEST_S3_ENDPOINT;
describe.runIf(endpoint)("the audio store in S3", () => {
  const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "test", secretAccessKey: "test" } });
  // One bucket for every run: SeaweedFS gives each bucket its own volumes and fails once they run out. Each test takes a fresh prefix.
  const bucket = "ibbun-test-audio";
  beforeAll(() => client.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => {}));

  audioStoreContract(async () => createS3AudioStore(client, { bucket, prefix: `${randomUUID()}/audio/` }));

  it("is what s3://bucket/audio/ in AUDIO_DIR names, keeping a clip at audio/<key>, the path CloudFront serves, as cacheable Ogg", async () => {
    const prefix = `${randomUUID()}/audio/`;
    vi.stubEnv("AWS_ENDPOINT_URL_S3", endpoint);
    vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test");
    try {
      await audioStoreAt(`s3://${bucket}/${prefix}`).put("k", new Uint8Array([9]));
    } finally {
      vi.unstubAllEnvs();
    }
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}k` }));
    expect({ type: object.ContentType, cache: object.CacheControl, body: [...(await object.Body!.transformToByteArray())] }).toEqual({ type: "audio/ogg", cache: "public, max-age=31536000, immutable", body: [9] });
  });
});

describe("listening.synthesise for a Sentence", () => {
  it("speaks the approved reading at 1.0 in the hashed voice and stores it under the hashed key", async () => {
    const t = setup();
    const id = t.sentence();
    await t.run({ kind: "sentence", sentenceId: id });

    const voice = sentenceVoice(VOICES, id);
    expect(t.tts.requests()).toEqual([{ kana: NEKO_KANA, voice: voice.id, speed: 1 }]);
    const key = audioKeyOf({ kana: NEKO_KANA, voice: voice.id, engineVersion: "0.26.0", speed: 1 });
    expect(await t.row(id)).toMatchObject({ audioKey: key, audioVoice: String(voice.id) });
    expect(await t.store.has(key)).toBe(true);
  });

  it("approves the audio by a derived process, with the engine, voice and speed", async () => {
    const t = setup();
    const id = t.sentence();
    await t.run({ kind: "sentence", sentenceId: id });

    const decisions = await t.auth.decisions(id);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ outcome: "approved", decider: { kind: "derived", process: "listening.synthesise", version: "0.26.0" } });
    expect(decisions[0]!.verdicts[0]).toMatchObject({ pass: true, note: `VOICEVOX 0.26.0, voice ${sentenceVoice(VOICES, id).id}, speed 1` });
  });

  it("does nothing the second time: no engine call, no new decision", async () => {
    const t = setup();
    const id = t.sentence();
    await t.run({ kind: "sentence", sentenceId: id });
    await t.run({ kind: "sentence", sentenceId: id });
    expect(t.tts.requests()).toHaveLength(1);
    expect(await t.auth.decisions(id)).toHaveLength(1);
  });

  it("reuses stored audio when the speech and voice match", async () => {
    const t = setup();
    const first = t.sentence();
    await t.run({ kind: "sentence", sentenceId: first });
    const twin = Array.from({ length: 200 }, () => randomUUID()).find((id) => sentenceVoice(VOICES, id).id === sentenceVoice(VOICES, first).id)!;
    t.graph.sentence.push({ ...(await t.row(first)), id: twin, audioKey: null, audioVoice: null });
    await t.run({ kind: "sentence", sentenceId: twin });
    expect(t.tts.requests()).toHaveLength(1);
    expect((await t.row(twin)).audioKey).toBe((await t.row(first)).audioKey);
  });

  it("gives the Listening Clip lines that voice the Sentence the same audio, credit and approval", async () => {
    const t = setup();
    const id = t.sentence();
    const lineId = randomUUID();
    t.graph.clipVoicesSentence.push({ id: lineId, clipId: randomUUID(), sentenceId: id, position: 0, speaker: "男", voice: "", audioKey: null, ...t.life, approval: "draft" });
    await t.run({ kind: "sentence", sentenceId: id });

    const voice = sentenceVoice(VOICES, id);
    const [line] = await t.auth.rows("clipVoicesSentence", { id: lineId });
    expect(line).toMatchObject({ voice: String(voice.id), audioKey: (await t.row(id)).audioKey, approval: "approved" });
    const [provenance] = await t.auth.rows("provenance", { id: line!.provenanceId });
    expect(provenance).toMatchObject({ source: { kind: "derived", process: "listening.synthesise" }, licence: "voicevox", author: `VOICEVOX:${voice.character}`, inputs: [id] });

    await t.run({ kind: "sentence", sentenceId: id });
    expect(await t.auth.decisions(lineId)).toHaveLength(1);
  });

  it("leaves a retired clip line alone", async () => {
    const t = setup();
    const id = t.sentence();
    const lineId = randomUUID();
    t.graph.clipVoicesSentence.push({ id: lineId, clipId: randomUUID(), sentenceId: id, position: 0, speaker: "男", voice: "", audioKey: null, ...t.life, retired: true });
    await t.run({ kind: "sentence", sentenceId: id });
    expect((await t.auth.rows("clipVoicesSentence", { id: lineId }))[0]!.audioKey).toBeNull();
  });

  it.each([
    ["a draft", NEKO, "draft" as const],
    ["a Sentence with no tokens", [], "approved" as const],
  ])("refuses %s and writes nothing", async (_, tokens, approval) => {
    const t = setup();
    const id = t.sentence(tokens, approval);
    await expect(t.run({ kind: "sentence", sentenceId: id })).rejects.toThrow();
    expect(t.tts.requests()).toEqual([]);
    expect((await t.row(id)).audioKey).toBeNull();
  });

  it("refuses a retired Sentence", async () => {
    const t = setup();
    const id = t.sentence();
    t.graph.sentence.find((s) => s.id === id)!.retired = true;
    await expect(t.run({ kind: "sentence", sentenceId: id })).rejects.toThrow();
  });

  it("fails for a Sentence that does not exist", async () => {
    const t = setup();
    await expect(t.run({ kind: "sentence", sentenceId: randomUUID() })).rejects.toThrow();
  });
});

describe("listening.synthesise for a dialogue", () => {
  const dialogue = (t: ReturnType<typeof setup>, lines = 3, state: { form?: "prose" | "dialogue"; approval?: "approved" | "draft"; retired?: boolean } = {}) => {
    const passageId = randomUUID();
    t.graph.readingPassage.push({ id: passageId, title: "会話", form: state.form ?? "dialogue", comprehensionQuestions: [], ...t.life, approval: state.approval ?? "approved", retired: state.retired ?? false });
    const sentences = Array.from({ length: lines }, (_, position) => {
      const sentenceId = t.sentence();
      t.graph.passageContainsSentence.push({ id: randomUUID(), passageId, sentenceId, position, speaker: null, ...t.life });
      return sentenceId;
    });
    // Stored out of order, to show the position decides.
    t.graph.passageContainsSentence.reverse();
    return { passageId, sentences };
  };

  it("voices the lines in order, alternating the two speakers with two distinct voices", async () => {
    const t = setup();
    const { passageId, sentences } = dialogue(t, 4);
    await t.run({ kind: "dialogue", passageId });

    const cast = dialogueVoices(VOICES, passageId);
    const voices = (await Promise.all(sentences.map(t.row))).map((s) => s.audioVoice);
    expect(voices).toEqual([cast.男, cast.女, cast.男, cast.女].map((v) => String(v.id)));
    expect(cast.男.id).not.toBe(cast.女.id);
    expect(t.tts.requests().map((r) => r.voice)).toEqual([cast.男.id, cast.女.id]);
  });

  it("gives a line the speaker its clip already names", async () => {
    const t = setup();
    const { passageId, sentences } = dialogue(t, 2);
    t.graph.clipVoicesSentence.push({ id: randomUUID(), clipId: randomUUID(), sentenceId: sentences[0]!, position: 0, speaker: "女", voice: "", audioKey: null, ...t.life });
    await t.run({ kind: "dialogue", passageId });
    expect((await t.row(sentences[0]!)).audioVoice).toBe(String(dialogueVoices(VOICES, passageId).女.id));
  });

  it("gives a line the speaker its passage names, before any clip's", async () => {
    const t = setup();
    const { passageId, sentences } = dialogue(t, 2);
    t.graph.passageContainsSentence.find((l) => l.sentenceId === sentences[1])!.speaker = "男";
    t.graph.clipVoicesSentence.push({ id: randomUUID(), clipId: randomUUID(), sentenceId: sentences[1]!, position: 0, speaker: "女", voice: "", audioKey: null, ...t.life });
    await t.run({ kind: "dialogue", passageId });
    expect((await t.row(sentences[1]!)).audioVoice).toBe(String(dialogueVoices(VOICES, passageId).男.id));
  });

  it("skips a line that was retired from the passage", async () => {
    const t = setup();
    const { passageId, sentences } = dialogue(t, 2);
    t.graph.passageContainsSentence.find((l) => l.sentenceId === sentences[1])!.retired = true;
    await t.run({ kind: "dialogue", passageId });
    expect((await t.row(sentences[1]!)).audioKey).toBeNull();
  });

  it.each([
    ["prose", { form: "prose" as const }],
    ["a draft", { approval: "draft" as const }],
    ["a retired dialogue", { retired: true }],
  ])("refuses %s", async (_, state) => {
    const t = setup();
    const { passageId } = dialogue(t, 2, state);
    await expect(t.run({ kind: "dialogue", passageId })).rejects.toThrow();
    expect(t.tts.requests()).toEqual([]);
  });

  it("is idempotent", async () => {
    const t = setup();
    const { passageId, sentences } = dialogue(t, 2);
    await t.run({ kind: "dialogue", passageId });
    await t.run({ kind: "dialogue", passageId });
    expect(t.tts.requests()).toHaveLength(2);
    expect(await t.auth.decisions(sentences[0]!)).toHaveLength(1);
  });
});
