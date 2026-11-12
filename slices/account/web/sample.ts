/** The one Review a visitor can answer before signing up: a Word in a sentence, asked for its meaning. */
export type Sample = { sentence: string; word: string; reading: string; meaning: string; accepted: string[] };

export const SAMPLE: Sample = {
  sentence: "水を飲みます。",
  word: "水",
  reading: "みず",
  meaning: "water",
  accepted: ["water"],
};

export const passes = (sample: Sample, answer: string): boolean => sample.accepted.includes(answer.trim().toLowerCase());
