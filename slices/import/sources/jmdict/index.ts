import type { RawFile, Source } from "../../server/source.ts";
import { get, release, type Fetch } from "../release.ts";
import { untgz } from "../tgz.ts";
import { parseJmdict } from "./parse.ts";

/** The full English file. `jmdict-eng-common-…` is the common-words-only cut, which must never be imported. */
const ASSET = /^jmdict-eng-\d.*\.json\.tgz$/;

/** JMdict from the jmdict-simplified releases (import-pipeline.md#schedule). The upstream version is the release tag. */
export const jmdictSource = (fetchImpl: Fetch = fetch): Source<"jmdict"> => ({
  dataset: "jmdict",
  latest: async () => (await release(fetchImpl)).tag_name,
  download: async (version) => {
    const asset = (await release(fetchImpl, version)).assets.find((a) => ASSET.test(a.name));
    if (!asset) throw new Error(`release ${version} has no jmdict-eng .json.tgz file`);
    const bytes = new Uint8Array(await (await get(fetchImpl, asset.browser_download_url, "application/octet-stream")).arrayBuffer());
    return [{ name: asset.name, bytes }];
  },
  parse: (files: RawFile[]) => {
    const archive = files.find((f) => ASSET.test(f.name));
    if (!archive) throw new Error("the raw files hold no jmdict-eng .json.tgz file");
    const json = untgz(archive.bytes).find((f) => f.name.endsWith(".json"));
    if (!json) throw new Error(`${archive.name} holds no .json file`);
    return parseJmdict(new TextDecoder().decode(json.bytes));
  },
});
