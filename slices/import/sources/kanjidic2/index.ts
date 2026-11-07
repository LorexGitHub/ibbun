import type { RawFile, Source } from "../../server/source.ts";
import { get, release, type Fetch } from "../release.ts";
import { untgz } from "../tgz.ts";
import { parseKanjidic } from "./parse.ts";

/** The `all` cut keeps every KANJIDIC2 character; `kanjidic2-en-…` drops the ~2,700 with no English meaning. */
const KANJIDIC = /^kanjidic2-all-\d.*\.json\.tgz$/;
const KRADFILE = /^kradfile-\d.*\.json\.tgz$/;

const WANTED = [
  { pattern: KANJIDIC, what: "kanjidic2-all" },
  { pattern: KRADFILE, what: "kradfile" },
];

const jsonOf = (files: RawFile[], pattern: RegExp, what: string): string => {
  const archive = files.find((f) => pattern.test(f.name));
  if (!archive) throw new Error(`the raw files hold no ${what} .json.tgz file`);
  const json = untgz(archive.bytes).find((f) => f.name.endsWith(".json"));
  if (!json) throw new Error(`${archive.name} holds no .json file`);
  return new TextDecoder().decode(json.bytes);
};

/**
 * KANJIDIC2 and KRADFILE from the jmdict-simplified releases, the same release JMdict comes from
 * (import-pipeline.md#schedule). The upstream version is the release tag, and one run holds both files.
 */
export const kanjidicSource = (fetchImpl: Fetch = fetch): Source<"kanjidic"> => ({
  dataset: "kanjidic",
  latest: async () => (await release(fetchImpl)).tag_name,
  download: async (version) => {
    const { assets } = await release(fetchImpl, version);
    return Promise.all(
      WANTED.map(async ({ pattern, what }) => {
        const asset = assets.find((a) => pattern.test(a.name));
        if (!asset) throw new Error(`release ${version} has no ${what} .json.tgz file`);
        const bytes = new Uint8Array(await (await get(fetchImpl, asset.browser_download_url, "application/octet-stream")).arrayBuffer());
        return { name: asset.name, bytes };
      }),
    );
  },
  parse: (files: RawFile[]) => parseKanjidic(jsonOf(files, KANJIDIC, "kanjidic2-all"), jsonOf(files, KRADFILE, "kradfile")),
});
