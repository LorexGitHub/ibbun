import type { Token } from "@mojibun/content-graph";

const KATAKANA = /^[ァ-ヶー]+$/;
/** Tokens that never start an accent phrase: they hang on the word before them. */
const BOUND = new Set(["助詞", "助動詞", "接尾辞"]);
const PAUSES = new Set(["、", "，", ","]);
const SPOKEN_PARTICLE: Record<string, string> = { は: "ワ", へ: "エ", を: "オ" };

const isPunctuation = (t: Token) => t.partOfSpeech[0] === "補助記号";

/** How a token is said: Sudachi's reading says ハ for the particle は, the voice says ワ. */
const spoken = (t: Token): string => {
  const particle = t.partOfSpeech[0] === "助詞" ? SPOKEN_PARTICLE[t.surface] : undefined;
  const sound = particle ?? t.reading;
  if (!KATAKANA.test(sound)) throw new Error(`no reading to speak for "${t.surface}"`);
  return sound;
};

/**
 * The kana string VOICEVOX is sent for a Sentence, built only from its approved tokens
 * (listening.md#audio-files): one accent phrase per content word with the particles after it, `/` between
 * phrases and `、` where the text pauses. The tokens carry no pitch, so each phrase puts its accent on the
 * last mora, which VOICEVOX reads as flat. Sentence-final marks are dropped.
 */
export const kanaOf = (tokens: readonly Token[]): string => {
  const phrases: { text: string; pauseAfter: boolean }[] = [];
  let joinNext = false;
  for (const token of tokens) {
    if (isPunctuation(token)) {
      if (PAUSES.has(token.surface) && phrases.length) phrases[phrases.length - 1]!.pauseAfter = true;
      continue;
    }
    const open = !phrases.length || phrases[phrases.length - 1]!.pauseAfter;
    if (open || (!BOUND.has(token.partOfSpeech[0]!) && !joinNext)) phrases.push({ text: "", pauseAfter: false });
    phrases[phrases.length - 1]!.text += spoken(token);
    joinNext = token.partOfSpeech[0] === "接頭辞";
  }
  if (!phrases.length) throw new Error("nothing to speak");
  return phrases
    .map((p, i) => `${p.text}'${i === phrases.length - 1 ? "" : p.pauseAfter ? "、" : "/"}`)
    .join("");
};
