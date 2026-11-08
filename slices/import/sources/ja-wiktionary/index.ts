import { gunzipSync } from "node:zlib";
import type { RawFile, Source } from "../../server/source.ts";
import { get, type Fetch } from "../release.ts";
import { parseWiktionary } from "./parse.ts";

/** The Japanese edition's wiktextract dump from kaikki.org, refreshed about weekly (research/japanese-explanation-sources.md#getting-the-data). */
const DUMP = "https://kaikki.org/jawiktionary/raw-wiktextract-data.jsonl.gz";
const NAME = "raw-wiktextract-data.jsonl.gz";

/** The extraction date, from the file's `Last-Modified`. kaikki.org keeps only the newest file, so no older version can be fetched. */
const versionOf = (response: Response): string => {
  const modified = Date.parse(response.headers.get("last-modified") ?? "");
  if (Number.isNaN(modified)) throw new Error(`${DUMP} sent no usable Last-Modified header`);
  return new Date(modified).toISOString().slice(0, 10);
};

/** ja Wiktionary glosses via kaikki.org. The upstream version is the extraction date. */
export const wiktionarySource = (fetchImpl: Fetch = fetch): Source<"wiktionary-ja"> => ({
  dataset: "wiktionary-ja",
  latest: async () => versionOf(await fetchImpl(DUMP, { method: "HEAD", headers: { "user-agent": "mojibun-import" } })),
  download: async (version) => {
    const response = await get(fetchImpl, DUMP, "application/gzip");
    if (versionOf(response) !== version) throw new Error(`kaikki.org now serves ${versionOf(response)}, not ${version}`);
    return [{ name: NAME, bytes: new Uint8Array(await response.arrayBuffer()) }];
  },
  parse: (files: RawFile[]) => {
    const dump = files.find((f) => f.name === NAME);
    if (!dump) throw new Error(`the raw files hold no ${NAME}`);
    return parseWiktionary(gunzipSync(dump.bytes));
  },
});
