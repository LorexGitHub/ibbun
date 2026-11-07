import { gunzipSync } from "node:zlib";
import type { RawFile, Source } from "../../server/source.ts";
import { get, githubRelease, type Fetch } from "../release.ts";
import { parseKanjivg } from "./parse.ts";

const REPO = "KanjiVG/kanjivg";
/** The one-file build. The `-main`, `-all` and `-stripped` zips hold one SVG per character. */
const ASSET = /^kanjivg-\d+\.xml\.gz$/;

/**
 * KanjiVG from its GitHub releases (import-pipeline.md#schedule). The upstream version is the release tag, so a run
 * applies only when the tag is new: checking weekly costs one API call and nothing else.
 */
export const kanjivgSource = (fetchImpl: Fetch = fetch): Source<"kanjivg"> => ({
  dataset: "kanjivg",
  latest: async () => (await githubRelease(fetchImpl, REPO)).tag_name,
  download: async (version) => {
    const asset = (await githubRelease(fetchImpl, REPO, version)).assets.find((a) => ASSET.test(a.name));
    if (!asset) throw new Error(`release ${version} has no kanjivg .xml.gz file`);
    const bytes = new Uint8Array(await (await get(fetchImpl, asset.browser_download_url, "application/octet-stream")).arrayBuffer());
    return [{ name: asset.name, bytes }];
  },
  parse: (files: RawFile[]) => {
    const archive = files.find((f) => ASSET.test(f.name));
    if (!archive) throw new Error("the raw files hold no kanjivg .xml.gz file");
    return parseKanjivg(gunzipSync(archive.bytes).toString("utf8"));
  },
});
