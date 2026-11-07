import { randomUUID } from "node:crypto";
import { ListeningSynthesise } from "@mojibun/content-graph/jobs";
import type { Authoring, Row } from "@mojibun/content-graph/authoring";
import { handler } from "@mojibun/jobs";
import type { z } from "zod";
import type { Tts } from "@mojibun/tts";
import { audioKeyOf, type AudioStore } from "./audio-store.ts";
import { kanaOf } from "./kana.ts";
import { dialogueVoices, sentenceVoice, type Speaker, type Voice } from "./voices.ts";

/** Audio is made once, at normal speed; Slow is the browser's `playbackRate` (listening.md#playback). */
export const SPEED = 1;
export const PROCESS = "listening.synthesise";

export type SynthesiseDeps = { auth: Authoring; tts: Tts; store: AudioStore; voices: readonly Voice[] };
type Sentence = Row<"sentence">;
export type SynthesiseTarget = z.output<typeof ListeningSynthesise.payload>["target"];

const approvedSentence = async (auth: Authoring, id: string): Promise<Sentence> => {
  const [sentence] = await auth.rows("sentence", { id });
  if (sentence?.approval !== "approved" || sentence.retired) throw new Error(`Sentence ${id} is not approved, so it has no approved reading to speak`);
  return sentence;
};

/** Sends the Sentence's approved reading to the engine unless audio for that exact speech is already stored. */
const render = async ({ tts, store }: SynthesiseDeps, sentence: Sentence, voice: Voice) => {
  const kana = kanaOf(sentence.tokens);
  const engineVersion = await tts.engineVersion();
  const key = audioKeyOf({ kana, voice: voice.id, engineVersion, speed: SPEED });
  if (!(await store.has(key))) await store.put(key, await tts.synthesise({ kana, voice: voice.id, speed: SPEED }));
  return { key, engineVersion };
};

/**
 * The kana sent is the Sentence's approved reading by construction, so the audio is approved by a derived
 * process, with the engine, voice and speed on the decision (content-approval.md#listening-clips).
 */
const approve = async (auth: Authoring, table: "sentence" | "clipVoicesSentence", recordId: string, voice: Voice, engineVersion: string) => {
  await auth.decide({
    recordTable: table,
    recordId,
    outcome: "approved",
    decider: { kind: "derived", process: PROCESS, version: engineVersion },
    verdicts: [{ criterion: "kana sent equals the approved reading", pass: true, note: `VOICEVOX ${engineVersion}, voice ${voice.id}, speed ${SPEED}` }],
  });
};

/** Gives a Sentence its audio, and every Listening Clip line that voices it. Running it again with the same speech writes nothing. */
const voiceSentence = async (deps: SynthesiseDeps, sentence: Sentence, voice: Voice) => {
  const { auth } = deps;
  const { key, engineVersion } = await render(deps, sentence, voice);
  const audioVoice = String(voice.id);
  if (sentence.audioKey !== key || sentence.audioVoice !== audioVoice) {
    await auth.update("sentence", { id: sentence.id }, { audioKey: key, audioVoice });
    await approve(auth, "sentence", sentence.id, voice, engineVersion);
  }
  for (const line of await auth.rows("clipVoicesSentence", { sentenceId: sentence.id, retired: false })) {
    if (line.audioKey === key && line.voice === audioVoice) continue;
    const provenanceId = randomUUID();
    await auth.insert("provenance", [
      { id: provenanceId, source: { kind: "derived", process: PROCESS, version: engineVersion }, licence: "voicevox", author: `VOICEVOX:${voice.character}`, sourceUrl: null, inputs: [sentence.id] },
    ]);
    await auth.update("clipVoicesSentence", { id: line.id }, { voice: audioVoice, audioKey: key, provenanceId });
    await approve(auth, "clipVoicesSentence", line.id, voice, engineVersion);
  }
};

/** Each line of an approved dialogue, in order, in its speaker's voice: the passage's, else a clip's; the rest alternate 男, 女. */
const voiceDialogue = async (deps: SynthesiseDeps, passageId: string) => {
  const { auth, voices } = deps;
  const [passage] = await auth.rows("readingPassage", { id: passageId });
  if (passage?.form !== "dialogue" || passage.approval !== "approved" || passage.retired) throw new Error(`Reading Passage ${passageId} is not an approved dialogue`);
  const cast = dialogueVoices(voices, passageId);
  const links = (await auth.rows("passageContainsSentence", { passageId, retired: false })).sort((a, b) => a.position - b.position);
  for (const [index, link] of links.entries()) {
    const [clipLine] = await auth.rows("clipVoicesSentence", { sentenceId: link.sentenceId, retired: false });
    const speaker: Speaker = link.speaker ?? clipLine?.speaker ?? (index % 2 === 0 ? "男" : "女");
    await voiceSentence(deps, await approvedSentence(auth, link.sentenceId), cast[speaker]);
  }
};

/** Runs one `listening.synthesise` job: Opus at 1.0 into object storage, keyed by hash (listening.md#audio-files). */
export const synthesise = async (deps: SynthesiseDeps, target: SynthesiseTarget) => {
  if (target.kind === "dialogue") return voiceDialogue(deps, target.passageId);
  await voiceSentence(deps, await approvedSentence(deps.auth, target.sentenceId), sentenceVoice(deps.voices, target.sentenceId));
};

export const synthesiseHandlers = (deps: SynthesiseDeps) => [handler(ListeningSynthesise, ({ target }) => synthesise(deps, target))];

export { audioKeyOf, createDirectoryAudioStore, createMemoryAudioStore, type AudioStore } from "./audio-store.ts";
export { loadSynthesisConfig, loadVoices, type Voice } from "./voices.ts";
