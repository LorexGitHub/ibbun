import Bunzip from "seek-bzip";
import type { SentenceRecord } from "@mojibun/content-graph/authoring";
import type { Nlp } from "@mojibun/nlp";
import type { RawFile, Source } from "../../server/source.ts";
import { chooseTranslation, parseDetailed, parseIds, parseIndexLine, parseIndices, parseLinks, parseNativeSpeakers } from "./parse.ts";
import { mapLimited, sudachiLinks, tokenize } from "./tokens.ts";

const EXPORTS = "https://downloads.tatoeba.org/exports";

/** The export files a run reads, as raw files named after themselves. */
const FILES = {
  japanese: { name: "jpn_sentences_detailed.tsv.bz2", url: `${EXPORTS}/per_language/jpn/jpn_sentences_detailed.tsv.bz2` },
  cc0: { name: "jpn_sentences_CC0.tsv.bz2", url: `${EXPORTS}/per_language/jpn/jpn_sentences_CC0.tsv.bz2` },
  links: { name: "jpn-eng_links.tsv.bz2", url: `${EXPORTS}/per_language/jpn/jpn-eng_links.tsv.bz2` },
  english: { name: "eng_sentences_detailed.tsv.bz2", url: `${EXPORTS}/per_language/eng/eng_sentences_detailed.tsv.bz2` },
  speakers: { name: "eng_user_languages.tsv.bz2", url: `${EXPORTS}/per_language/eng/eng_user_languages.tsv.bz2` },
  indices: { name: "jpn_indices.csv", url: `${EXPORTS}/jpn_indices.csv` },
} as const;

/** Sudachi calls in flight at once. */
const TOKENIZE_CONCURRENCY = 16;

type Fetch = typeof fetch;

const get = async (fetchImpl: Fetch, url: string, method = "GET") => {
  const response = await fetchImpl(url, { method, headers: { "user-agent": "mojibun-import" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
};

/** The text of each export file, decompressed. */
export type Exports = { [K in keyof typeof FILES]: string };

export const decodeExports = (files: RawFile[]): Exports =>
  Object.fromEntries(
    Object.entries(FILES).map(([key, { name }]) => {
      const found = files.find((f) => f.name === name);
      if (!found) throw new Error(`the raw files hold no ${name}`);
      const bytes = name.endsWith(".bz2") ? Bunzip.decode(Buffer.from(found.bytes)) : found.bytes;
      return [key, new TextDecoder().decode(bytes)];
    }),
  ) as Exports;

type Posts = ReturnType<typeof parseDetailed>;

/** English ids per Japanese id, for links whose both ends are in the exports. */
const translationsOf = (pairs: [string, string][], japanese: Posts, english: Posts): Map<string, string[]> => {
  const translations = new Map<string, string[]>();
  for (const [jpn, eng] of pairs.filter(([j, e]) => japanese.has(j) && english.has(e))) translations.set(jpn, [...(translations.get(jpn) ?? []), eng]);
  return translations;
};

/** `jpn_indices` links where it covers the Sentence (the line of the chosen translation, else the first), else Sudachi's. */
const linksOf = (covering: { english: string; line: string }[] | undefined, translation: string, text: string, tokens: SentenceRecord["tokens"]) => {
  const line = (covering?.find((c) => c.english === translation) ?? covering?.[0])?.line;
  return line ? parseIndexLine(line, text) : sudachiLinks(tokens);
};

/**
 * Japanese Sentences with an English translation, the translation the fixed rule chose, Sudachi tokens, and
 * Sentence-uses-Word links: `jpn_indices` where it covers the Sentence, else Sudachi's (import-pipeline.md#derived-links).
 */
export const buildSentences = async (exports: Exports, nlp: Nlp): Promise<SentenceRecord[]> => {
  const japanese = parseDetailed(exports.japanese);
  const english = parseDetailed(exports.english);
  const natives = parseNativeSpeakers(exports.speakers);
  const cc0 = parseIds(exports.cc0);
  const indices = parseIndices(exports.indices);

  const translations = translationsOf(parseLinks(exports.links), japanese, english);
  const chosen = [...translations].map(([key, ids]) => [key, chooseTranslation(ids, (id) => english.get(id)!.author, natives)] as const);
  return mapLimited(chosen, TOKENIZE_CONCURRENCY, async ([key, translation]): Promise<SentenceRecord> => {
    const { text: sentence, author } = japanese.get(key)!;
    const tokens = await tokenize(nlp, sentence);
    return {
      key,
      text: sentence,
      translationEn: english.get(translation)!.text,
      tokens,
      links: linksOf(indices.get(key), translation, sentence, tokens),
      author,
      licence: cc0.has(key) ? "cc0" : "cc-by-2.0-fr",
    };
  });
};

const dateOf = (response: Response): string => {
  const modified = response.headers.get("last-modified");
  if (!modified) throw new Error("Tatoeba did not say when its export was made");
  return new Date(modified).toISOString().slice(0, 10);
};

/**
 * Tatoeba's weekly export (import-pipeline.md#tatoeba). Upstream keeps only the newest export, so the version is its
 * date and an older one cannot be downloaded again; a replay parses the kept raw files instead.
 */
export const tatoebaSource = (nlp: Nlp, fetchImpl: Fetch = fetch): Source<"tatoeba"> => {
  const latest = async () => dateOf(await get(fetchImpl, FILES.japanese.url, "HEAD"));
  return {
    dataset: "tatoeba",
    latest,
    download: async (version) => {
      const newest = await latest();
      if (newest !== version) throw new Error(`Tatoeba only offers its export of ${newest}, not ${version}`);
      return Promise.all(
        Object.values(FILES).map(async ({ name, url }) => ({ name, bytes: new Uint8Array(await (await get(fetchImpl, url)).arrayBuffer()) })),
      );
    },
    parse: (files) => buildSentences(decodeExports(files), nlp),
  };
};
