import { inflateRawSync } from "node:zlib";
import type { RawFile, Source } from "../../server/source.ts";
import { get, type Fetch } from "../release.ts";
import { parseLexicon } from "./parse.ts";
import { openRemoteZip } from "./remote-zip.ts";

const DOWNLOADS = "https://clrd.ninjal.ac.jp/unidic/download.html";
/** The page links `/unidic_archive/2512/unidic-cwj-202512.zip`; the same folder holds the `_full` zip with `lex.csv`. */
const CWJ = /unidic_archive\/\d+\/unidic-cwj-(\d{6})\.zip/;
const archive = (version: string) => `https://clrd.ninjal.ac.jp/unidic_archive/${version.slice(2)}/unidic-cwj-${version}_full.zip`;

/** The deflated `lex.csv`, as stored in the zip: 275 MB inflated, 29 MB deflated. */
const LEXICON = "lex.csv.deflate";
const LICENCE = "BSD";

/**
 * UniDic cwj (modern written UniDic) `aType` as pitch accent (research/pitch-accent-source.md). The upstream version is the
 * release stamp in the file name, `202512`. Only `lex.csv` and the BSD licence text are fetched, by range request out of the
 * 3 GB `_full` zip, because the plain zip holds only the compiled dictionary.
 */
export const unidicSource = (fetchImpl: Fetch = fetch): Source<"unidic"> => ({
  dataset: "unidic",
  latest: async () => {
    const version = CWJ.exec(await (await get(fetchImpl, DOWNLOADS, "text/html")).text())?.[1];
    if (!version) throw new Error(`${DOWNLOADS} links no unidic-cwj zip`);
    return version;
  },
  download: async (version): Promise<RawFile[]> => {
    const zip = await openRemoteZip(fetchImpl, archive(version));
    return [
      { name: LEXICON, bytes: await zip.deflated("lex.csv") },
      { name: LICENCE, bytes: await zip.read("license/BSD") },
    ];
  },
  parse: (files) => {
    const lexicon = files.find((f) => f.name === LEXICON);
    if (!lexicon) throw new Error(`the raw files hold no ${LEXICON}`);
    return parseLexicon(inflateRawSync(lexicon.bytes));
  },
});
