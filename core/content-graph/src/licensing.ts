import type { Graph } from "./graph.ts";
import { LICENCES, type Licence } from "./schema.ts";

/** One row of docs/licensing.md#approved-licences. The code reads `inline` from here and never decides it per screen. */
export type LicenceTerms = { name: string; shareAlike: boolean; inline: boolean; credited: boolean };

export const LICENCE_TERMS: Record<Licence, LicenceTerms> = {
  edrdg: { name: "EDRDG Licence (CC BY-SA 4.0)", shareAlike: true, inline: false, credited: true },
  "cc-by-sa-4.0": { name: "CC BY-SA 4.0", shareAlike: true, inline: true, credited: true },
  "cc-by-sa-3.0": { name: "CC BY-SA 3.0", shareAlike: true, inline: false, credited: true },
  "cc-by-2.0-fr": { name: "CC BY 2.0 FR", shareAlike: false, inline: true, credited: true },
  "cc-by-4.0": { name: "CC BY 4.0", shareAlike: false, inline: false, credited: true },
  "cc-by": { name: "CC BY", shareAlike: false, inline: false, credited: true },
  "bsd-3-clause": { name: "BSD-3-Clause", shareAlike: false, inline: false, credited: true },
  voicevox: { name: "VOICEVOX voice terms", shareAlike: false, inline: true, credited: true },
  cc0: { name: "CC0", shareAlike: false, inline: false, credited: false },
  mojibun: { name: "mojibun-owned", shareAlike: false, inline: false, credited: false },
};

export const isLicence = (value: unknown): value is Licence => (LICENCES as readonly unknown[]).includes(value);

/** Rejects anything outside the closed list (docs/licensing.md#rules, rule 2). */
export const parseLicence = (value: unknown): Licence => {
  if (!isLicence(value)) throw new Error(`licence ${JSON.stringify(value)} is not on the approved list`);
  return value;
};

/** One credit a Learner sees. `inline` says it is shown next to the content, not only on Credits. */
export type Credit = { licence: Licence; licenceName: string; dataset: string | null; author: string | null; url: string | null; inline: boolean };

/** Every credit a record owes: its own and its inputs', transitively, deduplicated. */
export type Attribution = Credit[];

type Provenance = Graph["provenance"][number];

/** Each record's Provenance id, from every table whose rows carry one. */
export const recordProvenance = (graph: Graph): Map<string, string> => {
  const links = new Map<string, string>();
  for (const rows of Object.values(graph) as object[][]) {
    for (const row of rows) {
      const r = row as { id?: string; provenanceId?: string };
      if (r.id && r.provenanceId) links.set(r.id, r.provenanceId);
    }
  }
  return links;
};

const creditKey = (c: Credit) => JSON.stringify([c.licence, c.dataset, c.author, c.url]);

const dedupe = (credits: Credit[]) =>
  [...new Map(credits.map((c) => [creditKey(c), c])).values()].sort((a, b) => creditKey(a).localeCompare(creditKey(b), "en"));

type Lookup = { provenance: Map<string, Provenance>; datasets: Map<string, string>; links: Map<string, string> };

const provenanceOf = (l: Lookup, recordId: string) => l.provenance.get(l.links.get(recordId) ?? "");

/** The Provenance of `p`'s inputs, skipping any already on the path so a cycle ends. */
const inputsOf = (l: Lookup, p: Provenance, seen: Set<string>) =>
  p.inputs.map((recordId) => provenanceOf(l, recordId)).filter((input): input is Provenance => input !== undefined && !seen.has(input.id));

const ownCredit = (l: Lookup, p: Provenance): Credit[] => {
  const terms = LICENCE_TERMS[p.licence];
  if (!terms.credited) return [];
  const dataset = p.source.kind === "import" ? (l.datasets.get(p.source.importRunId) ?? null) : null;
  return [{ licence: p.licence, licenceName: terms.name, dataset, author: p.author, url: p.sourceUrl, inline: terms.inline }];
};

const licenceOfProvenance = (l: Lookup, p: Provenance, seen: Set<string>): Licence => {
  const path = new Set(seen).add(p.id);
  const inputs = inputsOf(l, p, path).map((input) => licenceOfProvenance(l, input, path));
  if (!inputs.length) return p.licence;
  return [p.licence, ...inputs].some((licence) => LICENCE_TERMS[licence].shareAlike) ? "cc-by-sa-4.0" : "mojibun";
};

const creditsOfProvenance = (l: Lookup, p: Provenance, seen: Set<string>): Credit[] => {
  const path = new Set(seen).add(p.id);
  return [...ownCredit(l, p), ...inputsOf(l, p, path).flatMap((input) => creditsOfProvenance(l, input, path))];
};

/**
 * Licence and Attribution, computed from Provenance (docs/licensing.md#computing-licence-and-attribution).
 * `links` maps record ids to Provenance ids; it defaults to the records in `graph`.
 */
export const licensing = (graph: Graph, links: Map<string, string> = recordProvenance(graph)) => {
  const l: Lookup = {
    provenance: new Map(graph.provenance.map((p) => [p.id, p])),
    datasets: new Map(graph.importRun.map((r) => [r.id, r.dataset])),
    links,
  };
  return {
    /** The record's licence: its source's when it has no inputs, else CC BY-SA 4.0 if anything is ShareAlike, else mojibun-owned. */
    licenceOf(recordId: string): Licence | null {
      const p = provenanceOf(l, recordId);
      return p ? licenceOfProvenance(l, p, new Set()) : null;
    },
    /** The Attribution the records together owe. */
    attributionOf(recordIds: string[]): Attribution {
      return dedupe(recordIds.flatMap((id) => {
        const p = provenanceOf(l, id);
        return p ? creditsOfProvenance(l, p, new Set()) : [];
      }));
    },
  };
};

/** A source the Credits page lists, keyed by the Import Run dataset that brings it in. */
export type Source = { dataset: string; name: string; licence: Licence; url: string };

export const SOURCES: Source[] = [
  { dataset: "jmdict", name: "JMdict", licence: "edrdg", url: "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project" },
  { dataset: "kanjidic2", name: "KANJIDIC2", licence: "edrdg", url: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" },
  { dataset: "kradfile", name: "KRADFILE", licence: "edrdg", url: "https://www.edrdg.org/krad/kradinf.html" },
  { dataset: "jmdict-furigana", name: "JmdictFurigana", licence: "edrdg", url: "https://github.com/Doublevil/JmdictFurigana" },
  { dataset: "kanjivg", name: "KanjiVG (© Ulrich Apel)", licence: "cc-by-sa-3.0", url: "https://kanjivg.tagaini.net/" },
  { dataset: "tatoeba", name: "Tatoeba", licence: "cc-by-2.0-fr", url: "https://tatoeba.org/" },
  { dataset: "tanos", name: "Jonathan Waller's JLPT Resources (Tanos)", licence: "cc-by", url: "http://www.tanos.co.uk/jlpt/" },
  { dataset: "hanabira", name: "hanabira", licence: "cc-by-4.0", url: "https://hanabira.org/" },
  { dataset: "unidic", name: "UniDic", licence: "bsd-3-clause", url: "https://clrd.ninjal.ac.jp/unidic/" },
  { dataset: "wiktionary-ja", name: "Wiktionary (ja)", licence: "cc-by-sa-4.0", url: "https://ja.wiktionary.org/" },
];

export const VOICEVOX_URL = "https://voicevox.hiroshiba.jp/";

/** One line of the Credits page. `version` and `appliedAt` are the live Import Run's, or null before the first. */
export type CreditsEntry = {
  name: string;
  licence: Licence;
  licenceName: string;
  url: string;
  version: string | null;
  appliedAt: Date | null;
};

/** The Credits page data: every source with its live version, then every `VOICEVOX:<character>` in use. */
export const creditsOf = (graph: Pick<Graph, "importRun" | "provenance">): CreditsEntry[] => {
  const live = (dataset: string) =>
    graph.importRun
      .filter((r) => r.dataset === dataset && r.appliedAt !== null)
      .sort((a, b) => a.appliedAt!.getTime() - b.appliedAt!.getTime())
      .at(-1);
  const sources = SOURCES.map((s) => {
    const run = live(s.dataset);
    return { name: s.name, licence: s.licence, licenceName: LICENCE_TERMS[s.licence].name, url: s.url, version: run?.upstreamVersion ?? null, appliedAt: run?.appliedAt ?? null };
  });
  const characters = [...new Set(graph.provenance.filter((p) => p.licence === "voicevox" && p.author).map((p) => p.author!))].sort();
  const voices = characters.map((character) => ({
    name: `VOICEVOX:${character}`,
    licence: "voicevox" as const,
    licenceName: LICENCE_TERMS.voicevox.name,
    url: VOICEVOX_URL,
    version: null,
    appliedAt: null,
  }));
  return [...sources, ...voices];
};
