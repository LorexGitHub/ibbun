export type Fetch = typeof fetch;

/** A GET that fails on any answer but 2xx. Sources use it for release lookups and downloads. */
export const get = async (fetchImpl: Fetch, url: string, accept: string) => {
  const response = await fetchImpl(url, { headers: { accept, "user-agent": "mojibun-import" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
};
