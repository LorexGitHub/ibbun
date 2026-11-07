import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { get } from "../../server/http.ts";
import type { RawFile, Source } from "../../server/source.ts";
import { parseKanjivg } from "./parse.ts";

const RELEASES = "https://api.github.com/repos/KanjiVG/kanjivg/releases/latest";
/** The one-file build. The `-main`, `-all` and `-stripped` zips hold one SVG per character. */
const ASSET = /^kanjivg-\d+\.xml\.gz$/;

const Release = z.object({
  tag_name: z.string().min(1),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.url() })),
});

type Fetch = typeof fetch;

/**
 * KanjiVG from its GitHub releases (import-pipeline.md#schedule). The upstream version is the release tag, so a run
 * applies only when the tag is new: checking weekly costs one API call and nothing else.
 */
export const kanjivgSource = (fetchImpl: Fetch = fetch): Source<"kanjivg"> => {
  const release = async (tag?: string) => {
    const url = tag ? RELEASES.replace("latest", `tags/${encodeURIComponent(tag)}`) : RELEASES;
    return Release.parse(await (await get(fetchImpl, url, "application/vnd.github+json")).json());
  };
  return {
    dataset: "kanjivg",
    latest: async () => (await release()).tag_name,
    download: async (version) => {
      const asset = (await release(version)).assets.find((a) => ASSET.test(a.name));
      if (!asset) throw new Error(`release ${version} has no kanjivg .xml.gz file`);
      const bytes = new Uint8Array(await (await get(fetchImpl, asset.browser_download_url, "application/octet-stream")).arrayBuffer());
      return [{ name: asset.name, bytes }];
    },
    parse: (files: RawFile[]) => {
      const archive = files.find((f) => ASSET.test(f.name));
      if (!archive) throw new Error("the raw files hold no kanjivg .xml.gz file");
      return parseKanjivg(gunzipSync(archive.bytes).toString("utf8"));
    },
  };
};
