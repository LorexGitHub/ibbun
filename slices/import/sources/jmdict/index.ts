import { z } from "zod";
import { get, type Fetch } from "../../server/http.ts";
import type { RawFile, Source } from "../../server/source.ts";
import { parseJmdict } from "./parse.ts";
import { untgz } from "./tgz.ts";

const RELEASES = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest";
/** The full English file. `jmdict-eng-common-…` is the common-words-only cut, which must never be imported. */
const ASSET = /^jmdict-eng-\d.*\.json\.tgz$/;

const Release = z.object({
  tag_name: z.string().min(1),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.url() })),
});

/** JMdict from the jmdict-simplified releases (import-pipeline.md#schedule). The upstream version is the release tag. */
export const jmdictSource = (fetchImpl: Fetch = fetch): Source<"jmdict"> => {
  const release = async (tag?: string) => {
    const url = tag ? RELEASES.replace("latest", `tags/${encodeURIComponent(tag)}`) : RELEASES;
    return Release.parse(await (await get(fetchImpl, url, "application/vnd.github+json")).json());
  };
  return {
    dataset: "jmdict",
    latest: async () => (await release()).tag_name,
    download: async (version) => {
      const asset = (await release(version)).assets.find((a) => ASSET.test(a.name));
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
  };
};
