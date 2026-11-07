/** One GET that fails on a non-2xx answer, as every source's `latest` and `download` need. */
export const get = async (fetchImpl: typeof fetch, url: string, accept: string) => {
  const response = await fetchImpl(url, { headers: { accept, "user-agent": "mojibun-import" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
};
