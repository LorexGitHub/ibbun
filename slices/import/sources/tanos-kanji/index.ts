import type { Source } from "../../server/source.ts";
import { get, type Fetch } from "../release.ts";
import { LEVELS, fileOf, parseKanjiLevels } from "./parse.ts";

/**
 * tanos.co.uk no longer resolves and its lists have not changed since 2010–2011, so the Kanji lists come once from
 * this Wayback Machine snapshot, and the snapshot is the only version there is (jlpt-levels.md#sources).
 */
export const SNAPSHOT = "20200117222855";
const pageUrl = (level: string) => `https://web.archive.org/web/${SNAPSHOT}id_/http://www.tanos.co.uk/jlpt/jlpt${level.slice(1)}/kanji/`;

/**
 * Kanji JLPT Levels from the archived Tanos lists. `report` takes one line per collision.
 * Run it after KANJIDIC2: a run with no Kanji to attach to fails instead of applying nothing.
 */
export const tanosSource = (fetchImpl: Fetch = fetch, report: (line: string) => void = console.info): Source<"tanos"> => ({
  dataset: "tanos",
  latest: async () => SNAPSHOT,
  download: async (version) => {
    if (version !== SNAPSHOT) throw new Error(`only the ${SNAPSHOT} snapshot is held, not ${version}`);
    return Promise.all(
      LEVELS.map(async (level) => ({
        name: fileOf(level),
        bytes: new Uint8Array(await (await get(fetchImpl, pageUrl(level), "text/html")).arrayBuffer()),
      })),
    );
  },
  parse: (files) => parseKanjiLevels(files.map((f) => ({ name: f.name, text: new TextDecoder().decode(f.bytes) })), report),
});
