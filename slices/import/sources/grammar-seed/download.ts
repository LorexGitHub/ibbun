import type { JlptLevel } from "@mojibun/shared";
import { get, type Fetch } from "../release.ts";
import { parseHanabira, type HanabiraPoint } from "./hanabira.ts";
import { parseTanos, type TanosEntry } from "./tanos.ts";

export const LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

const HANABIRA = "tristcoil/hanabira.org-japanese-content";
/** tanos.co.uk no longer resolves (docs/research/tanos-kanjium-licences.md), so the lists come from the Wayback Machine, which redirects this to its snapshot nearest 2020. */
const TANOS_SNAPSHOT = "2020";

export type GrammarSources = {
  /** The hanabira commit the points were read at: the Provenance of every seeded point. */
  hanabiraCommit: string;
  tanosSnapshot: string;
  hanabira: HanabiraPoint[];
  tanos: TanosEntry[];
};

const text = async (fetchImpl: Fetch, url: string) => (await get(fetchImpl, url, "*/*")).text();

const hanabiraFile = (level: JlptLevel) => `grammar_json/grammar_ja_${level}_full_alphabetical_0001.json`;
const tanosPage = (level: JlptLevel) => `https://web.archive.org/web/${TANOS_SNAPSHOT}id_/http://www.tanos.co.uk/jlpt/jlpt${level.slice(1)}/grammar/`;

const latestCommit = async (fetchImpl: Fetch): Promise<string> => {
  const body = (await (await get(fetchImpl, `https://api.github.com/repos/${HANABIRA}/commits/HEAD`, "application/vnd.github+json")).json()) as { sha?: unknown };
  if (typeof body.sha !== "string") throw new Error("the hanabira commit lookup returned no sha");
  return body.sha;
};

/** Downloads and parses the five hanabira level files at their latest commit and the five Tanos level lists. */
export const downloadGrammarSources = async (fetchImpl: Fetch = fetch): Promise<GrammarSources> => {
  const hanabiraCommit = await latestCommit(fetchImpl);
  const raw = `https://raw.githubusercontent.com/${HANABIRA}/${hanabiraCommit}/`;
  const hanabira = await Promise.all(LEVELS.map(async (level) => parseHanabira(level, await text(fetchImpl, raw + hanabiraFile(level)))));
  const tanos = await Promise.all(LEVELS.map(async (level) => parseTanos(level, await text(fetchImpl, tanosPage(level)))));
  return { hanabiraCommit, tanosSnapshot: TANOS_SNAPSHOT, hanabira: hanabira.flat(), tanos: tanos.flat() };
};
