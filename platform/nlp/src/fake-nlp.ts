import type { Nlp, Token } from "./nlp.ts";

/**
 * A deterministic stand-in for Sudachi. It splits text by longest match
 * against the tokens it was given, and rejects text it has no token for,
 * so a test never passes on a reading the fake made up.
 */
export const createFakeNlp = (lexicon: readonly Token[]): Nlp => {
  const longestFirst = [...lexicon].sort((a, b) => b.surface.length - a.surface.length);

  const matchAt = (text: string, start: number): Token => {
    const token = longestFirst.find(({ surface }) => text.startsWith(surface, start));
    if (!token) throw new Error(`fake nlp has no token for "${text.slice(start)}"`);
    return token;
  };

  return {
    async tokenize(text) {
      const tokens: Token[] = [];
      for (let start = 0; start < text.length; start += tokens.at(-1)!.surface.length) tokens.push(matchAt(text, start));
      return tokens;
    },
  };
};
