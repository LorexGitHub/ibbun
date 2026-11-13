import { createHash, randomUUID } from "node:crypto";
import type { Authoring } from "@ibbun/content-graph/authoring";
import type { GrammarForm, Licence, Token } from "@ibbun/content-graph";
import type { JlptLevel } from "@ibbun/shared";

/** A hanabira example Sentence once Sudachi has split it. */
export type SeedExample = { text: string; translationEn: string; tokens: Token[] };

/** One Grammar Point to seed, from either list. Tanos entries have a title and a level and nothing else. */
export type SeedPoint = {
  key: string;
  level: JlptLevel;
  title: string;
  meaning: string;
  notes: string | null;
  formation: string[];
  examples: SeedExample[];
};

export type SeedInput = {
  /** The hanabira commit and the Tanos snapshot: the Provenance of every point seeded from them. */
  hanabira: { version: string; points: SeedPoint[] };
  tanos: { version: string; points: SeedPoint[] };
};

type List = { dataset: "hanabira" | "tanos"; runDataset: string; licence: Licence; sourceUrl: string };

const HANABIRA: List = { dataset: "hanabira", runDataset: "hanabira", licence: "cc-by-4.0", sourceUrl: "https://hanabira.org" };
/** The Import Run says `tanos-grammar` so a later Tanos kanji or vocab run keeps its own live version; the source keys say `tanos`, which the merge proposal kind reads. */
const TANOS: List = { dataset: "tanos", runDataset: "tanos-grammar", licence: "cc-by", sourceUrl: "https://www.tanos.co.uk/jlpt/" };

const POLITE = /ます|ません|です|でした/;
const formOf = (title: string): GrammarForm => ({ text: title, register: POLITE.test(title) ? "polite" : "casual" });

const checksum = (points: SeedPoint[]) => createHash("sha256").update(JSON.stringify(points)).digest("hex");

const seedExample = async (auth: Authoring, provenanceId: string, pointId: string, example: SeedExample) => {
  const id = randomUUID();
  const { text, translationEn, tokens } = example;
  await auth.insert("sentence", [{ id, text, translationEn, tokens, audioKey: null, audioVoice: null, unlevelledWordCount: 0, approval: "draft", retired: false, provenanceId }]);
  // hanabira gives no span, so the draft link covers the whole Sentence until the reviewer agent narrows it.
  await auth.insert("sentenceDemonstratesGrammar", [
    { id: randomUUID(), sentenceId: id, grammarPointId: pointId, spanStart: 0, spanEnd: text.length, approval: "draft", retired: false, provenanceId },
  ]);
};

const seedPoint = async (auth: Authoring, list: List, provenanceId: string, point: SeedPoint): Promise<string> => {
  const id = randomUUID();
  const life = { approval: "draft", retired: false, provenanceId } as const;
  await auth.insert("studyItem", [{ id, type: "grammar_point", ...life }]);
  await auth.insert("grammarPoint", [
    { studyItemId: id, title: point.title, forms: [formOf(point.title)], formation: point.formation, register: "neutral", meaning: point.meaning, notes: point.notes, matcherRule: null },
  ]);
  await auth.insert("levelCandidate", [{ id: randomUUID(), studyItemId: id, level: point.level, kind: "list", ...life }]);
  await auth.insert("sourceKey", [{ dataset: list.dataset, upstreamKey: point.key, recordId: id }]);
  for (const example of point.examples) await seedExample(auth, provenanceId, id, example);
  return id;
};

const seedList = async (auth: Authoring, list: List, source: SeedInput["hanabira"], now: Date): Promise<string[]> => {
  const importRunId = randomUUID();
  const counts = { added: source.points.length, sentences: source.points.reduce((n, p) => n + p.examples.length, 0) };
  await auth.insert("importRun", [{ id: importRunId, dataset: list.runDataset, upstreamVersion: source.version, checksum: checksum(source.points), status: "applied", counts, appliedAt: now }]);
  const provenanceId = randomUUID();
  await auth.insert("provenance", [{ id: provenanceId, source: { kind: "import", importRunId }, licence: list.licence, author: null, sourceUrl: list.sourceUrl, inputs: [] }]);
  const ids: string[] = [];
  for (const point of source.points) ids.push(await seedPoint(auth, list, provenanceId, point));
  return ids;
};

/**
 * The one-time Grammar Point seed (grammar-points.md#inventory, ADR 0006): every hanabira and Tanos point arrives `draft`, hanabira's example Sentences
 * arrive `draft` with `draft` demonstrates links. It writes no schedule and no Override. Run it inside one transaction. A second call changes nothing
 * and returns null. Returns the hanabira Grammar Point ids, which each get a merge proposal.
 */
export const seedGrammar = async (auth: Authoring, input: SeedInput, now: Date = new Date()): Promise<string[] | null> => {
  if ((await auth.rows("importRun", { dataset: HANABIRA.runDataset })).length) return null;
  const hanabira = await seedList(auth, HANABIRA, input.hanabira, now);
  await seedList(auth, TANOS, input.tanos, now);
  return hanabira;
};
