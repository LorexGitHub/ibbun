import { fetchJson, postJson } from "../../web/api.ts";
import { Library, PracticeOptions, PracticeResult, TextView, type PracticeRequest } from "../contract.ts";

export const loadOptions = async () => PracticeOptions.parse(await fetchJson("/practice/options"));

export const loadLibrary = async () => Library.parse(await fetchJson("/practice/texts"));

export const loadPracticeText = async (id: string) => TextView.parse(await fetchJson(`/practice/texts/${id}`));

export const generate = async (request: PracticeRequest) => PracticeResult.parse(await postJson("/practice/texts", request));
