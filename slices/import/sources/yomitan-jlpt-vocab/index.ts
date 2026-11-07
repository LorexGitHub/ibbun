import { z } from "zod";
import { get, type Fetch } from "../../server/http.ts";
import type { RawFile, Source } from "../../server/source.ts";
import { LEVELS, fileOf, parseLevels } from "./parse.ts";

const REPO = "stephenmk/yomitan-jlpt-vocab";
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
/** The release zip is a Yomitan dictionary with no `ent_seq`; the CSVs it was built from carry it. */
const csvUrl = (tag: string, file: string) => `https://raw.githubusercontent.com/${REPO}/${encodeURIComponent(tag)}/original_data/${file}`;

const Release = z.object({ tag_name: z.string().min(1) });

/**
 * Word JLPT Levels from yomitan-jlpt-vocab (jlpt-levels.md#sources). The upstream version is the release tag; the
 * data is the five `original_data` CSVs at that tag. `report` takes one line per collision and per skipped row.
 */
export const yomitanSource = (fetchImpl: Fetch = fetch, report: (line: string) => void = console.info): Source<"yomitan"> => ({
  dataset: "yomitan",
  latest: async () => Release.parse(await (await get(fetchImpl, LATEST, "application/vnd.github+json")).json()).tag_name,
  download: (version) =>
    Promise.all(
      LEVELS.map(async (level): Promise<RawFile> => {
        const name = fileOf(level);
        return { name, bytes: new Uint8Array(await (await get(fetchImpl, csvUrl(version, name), "text/csv")).arrayBuffer()) };
      }),
    ),
  parse: (files) => parseLevels(files.map((f) => ({ name: f.name, text: new TextDecoder().decode(f.bytes) })), report),
});
