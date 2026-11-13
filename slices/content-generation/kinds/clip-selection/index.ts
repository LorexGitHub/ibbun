import { createHash, randomUUID } from "node:crypto";
import type { Authoring } from "@ibbun/content-graph/authoring";
import type { JlptLevel } from "@ibbun/shared";

const PROCESS = "clip-selection";
const VERSION = "1";

/** Accepted length of a Sentence's text, in characters, at one level (listening.md#single-sentence-clips). */
export type LengthBand = { min: number; max: number };
export type ClipVoice = { voice: string; speaker: "男" | "女" };

type Voices = readonly [ClipVoice, ...ClipVoice[]];

export type ClipSelectionConfig = {
  bands: Record<JlptLevel, LengthBand>;
  /** The VOICEVOX allow-list the supervisor picked by listening (#11). */
  voices: Voices;
};

export const DEFAULT_BANDS: ClipSelectionConfig["bands"] = { N5: { min: 10, max: 25 }, N4: { min: 12, max: 30 }, N3: { min: 15, max: 35 }, N2: { min: 18, max: 40 }, N1: { min: 20, max: 45 } };

const sha = (...parts: string[]) => createHash("sha256").update(parts.join(":")).digest("hex");

/** Orders Sentences that fit the band equally well; the lowest wins. */
export const tieBreak = (studyItemId: string, sentenceId: string) => sha(studyItemId, sentenceId);

const distanceFrom = ({ min, max }: LengthBand, text: string) => {
  const length = [...text].length;
  return Math.max(min - length, length - max, 0);
};

type Candidate = { id: string; text: string };

/** Closest to the band, then lowest tie-break hash. Null when there is nothing to pick from. */
const pick = (studyItemId: string, band: LengthBand, candidates: readonly Candidate[]): string | null => {
  const ranked = candidates
    .map((c) => ({ id: c.id, distance: distanceFrom(band, c.text), hash: tieBreak(studyItemId, c.id) }))
    .sort((a, b) => a.distance - b.distance || a.hash.localeCompare(b.hash));
  return ranked[0]?.id ?? null;
};

/** The voice at `hash(Sentence ID) mod allow-list` (listening.md#voices). */
const voiceFor = (voices: Voices, sentenceId: string): ClipVoice =>
  voices[Number(BigInt(`0x${sha(sentenceId).slice(0, 12)}`) % BigInt(voices.length))]!;

const decider = { kind: "derived", process: PROCESS, version: VERSION } as const;

export type ClipSelection = {
  /**
   * Makes the single-Sentence clip of a levelled Word or Grammar Point: the fixed rule, no LLM.
   * Run it again whenever the item's Examples change; a clip whose Sentence no longer qualifies is Retired and the rule picks again.
   */
  select(studyItemId: string): Promise<void>;
};

/** Live clips of the item, found through the derived Provenance that names it as its first input. */
const liveClips = async (auth: Authoring, studyItemId: string) => {
  const clips = await auth.rows("studyItem", { type: "listening_clip", retired: false });
  const owned = [];
  for (const clip of clips) {
    const [provenance] = await auth.rows("provenance", { id: clip.provenanceId });
    if (provenance?.source.kind !== "derived" || provenance.source.process !== PROCESS || provenance.inputs[0] !== studyItemId) continue;
    const [line] = await auth.rows("clipVoicesSentence", { clipId: clip.id });
    owned.push({ id: clip.id, sentenceId: line?.sentenceId });
  }
  return owned;
};

const qualifying = async (auth: Authoring, studyItemId: string): Promise<Candidate[]> => {
  const examples = await auth.rows("example", { studyItemId, approval: "approved", retired: false });
  const sentences = await Promise.all(examples.map(async (e) => (await auth.rows("sentence", { id: e.sentenceId, approval: "approved", retired: false }))[0]));
  return sentences.filter((s): s is NonNullable<typeof s> => !!s && s.unlevelledWordCount === 0);
};

/** The item's level, or null when it has none or can't have a clip. */
const clipLevel = async (auth: Authoring, studyItemId: string) => {
  const [item] = await auth.rows("studyItem", { id: studyItemId, approval: "approved", retired: false });
  if (item?.type !== "word" && item?.type !== "grammar_point") return null;
  return (await auth.rows("computedLevel", { recordId: studyItemId }))[0]?.level ?? null;
};

const make = async (auth: Authoring, voices: Voices, studyItemId: string, sentenceId: string) => {
  const provenanceId = randomUUID();
  const clipId = randomUUID();
  await auth.insert("provenance", [
    { id: provenanceId, source: { kind: "derived", process: PROCESS, version: VERSION }, licence: "ibbun", author: null, sourceUrl: null, inputs: [studyItemId, sentenceId] },
  ]);
  const life = { approval: "approved", retired: false, provenanceId } as const;
  await auth.insert("studyItem", [{ id: clipId, type: "listening_clip", ...life }]);
  await auth.insert("listeningClip", [{ studyItemId: clipId, kind: "sentence" }]);
  const { voice, speaker } = voiceFor(voices, sentenceId);
  await auth.insert("clipVoicesSentence", [{ id: randomUUID(), clipId, sentenceId, position: 0, speaker, voice, audioKey: null, ...life }]);
};

export const clipSelection = (auth: Authoring, config: ClipSelectionConfig): ClipSelection => ({
  async select(studyItemId) {
    const level = await clipLevel(auth, studyItemId);
    const chosen = level ? pick(studyItemId, config.bands[level], await qualifying(auth, studyItemId)) : null;

    const live = await liveClips(auth, studyItemId);
    for (const clip of live.filter((c) => c.sentenceId !== chosen)) {
      await auth.decide({ recordTable: "studyItem", recordId: clip.id, outcome: "retired", decider, reason: "its Sentence no longer qualifies" });
    }
    if (chosen && !live.some((c) => c.sentenceId === chosen)) await make(auth, config.voices, studyItemId, chosen);
  },
});
