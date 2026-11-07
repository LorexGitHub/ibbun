import { createHash } from "node:crypto";
import { z } from "zod";

/** One allow-listed VOICEVOX voice: the style id the engine takes, its credit name and which speaker it suits. */
export const Voice = z.object({ id: z.number().int().nonnegative(), character: z.string().min(1), speaker: z.enum(["男", "女"]) });
export type Voice = z.output<typeof Voice>;
export type Speaker = Voice["speaker"];

/** The supervisor's pick: 4–6 calm, adult voices, credited as `VOICEVOX:<character>` (listening.md#voices). */
export const VoiceAllowList = z.array(Voice).min(4).max(6).refine(
  (voices) => (["男", "女"] as const).every((s) => voices.some((v) => v.speaker === s)),
  "the allow-list needs a male-sounding and a female-sounding voice",
);

/** Reads VOICE_ALLOW_LIST, a JSON array of voices. */
export const loadVoices = (env: Record<string, string | undefined>): Voice[] => VoiceAllowList.parse(JSON.parse(env.VOICE_ALLOW_LIST ?? "null"));

const hashOf = (id: string) => createHash("sha256").update(id).digest().readUInt32BE(0);

const pick = (voices: readonly Voice[], id: string): Voice => {
  const voice = voices[hashOf(id) % voices.length];
  if (!voice) throw new Error("the voice allow-list has no voice for this speaker");
  return voice;
};

/** Sentence Audio and single-Sentence clips: the voice at hash(Sentence ID) mod the allow-list. */
export const sentenceVoice = (voices: readonly Voice[], sentenceId: string): Voice => pick(voices, sentenceId);

/** A dialogue's two voices, one per speaker, picked by hash(passage ID) among the voices that suit each. */
export const dialogueVoices = (voices: readonly Voice[], passageId: string): Record<Speaker, Voice> => ({
  男: pick(voices.filter((v) => v.speaker === "男"), passageId),
  女: pick(voices.filter((v) => v.speaker === "女"), passageId),
});

/** What the worker needs to synthesise, read once from the environment so a missing setting names itself. */
export const loadSynthesisConfig = (env: Record<string, string | undefined>) => {
  const { DATABASE_URL: databaseUrl, VOICEVOX_URL: voicevoxUrl, AUDIO_DIR: audioDir } = env;
  if (!databaseUrl || !voicevoxUrl || !audioDir) throw new Error("DATABASE_URL, VOICEVOX_URL and AUDIO_DIR must be set to synthesise");
  return { databaseUrl, voicevoxUrl, audioDir, voices: loadVoices(env) };
};
