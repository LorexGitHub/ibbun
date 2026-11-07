import { z } from "zod";

const LATEST = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest";

const Release = z.object({
  tag_name: z.string().min(1),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.url() })),
});
export type Release = z.output<typeof Release>;

export type Fetch = typeof fetch;

export const get = async (fetchImpl: Fetch, url: string, accept: string) => {
  const response = await fetchImpl(url, { headers: { accept, "user-agent": "mojibun-import" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
};

/** A jmdict-simplified release: the latest one, or the one with this tag. JMdict and KANJIDIC2 both come from it. */
export const release = async (fetchImpl: Fetch, tag?: string): Promise<Release> => {
  const url = tag ? LATEST.replace("latest", `tags/${encodeURIComponent(tag)}`) : LATEST;
  return Release.parse(await (await get(fetchImpl, url, "application/vnd.github+json")).json());
};
