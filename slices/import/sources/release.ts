import { z } from "zod";

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

/** A GitHub release of `repo` (`owner/name`): the latest one, or the one with this tag. */
export const githubRelease = async (fetchImpl: Fetch, repo: string, tag?: string): Promise<Release> => {
  const url = `https://api.github.com/repos/${repo}/releases/${tag ? `tags/${encodeURIComponent(tag)}` : "latest"}`;
  return Release.parse(await (await get(fetchImpl, url, "application/vnd.github+json")).json());
};

/** A jmdict-simplified release. JMdict and KANJIDIC2 both come from it. */
export const release = (fetchImpl: Fetch, tag?: string): Promise<Release> => githubRelease(fetchImpl, "scriptin/jmdict-simplified", tag);
