import { randomUUID } from "node:crypto";
import type { Authoring, DerivedLinkTable, Row } from "@ibbun/content-graph/authoring";
import type { Desired } from "./derive.ts";

type Link<N extends DerivedLinkTable> = Row<N>;
type Licence = Row<"provenance">["licence"];

/** `keeps` names the processes whose links in the same table a rebuild leaves alone. */
export type Process = { name: string; version: string; licence: Licence; keeps?: string[] };
export type Changes = { added: number; removed: number };

const CHUNK = 1000;

/** What a link means, whatever its ID, lifecycle or Provenance. */
const meaning = (link: object) => {
  const { id: _id, approval: _a, retired: _r, provenanceId: _p, ...rest } = link as Record<string, unknown>;
  return JSON.stringify(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
};

/** Batches that keep one statement under the Postgres parameter limit. */
export const chunks = <T>(items: T[], size = CHUNK) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** The one Provenance row for a process version, made on first use. */
const provenanceFor = async (authoring: Authoring, { name, version, licence }: Process) => {
  const found = (await authoring.rows("provenance")).find(({ source }) => source.kind === "derived" && source.process === name && source.version === version);
  if (found) return found.id;
  const id = randomUUID();
  await authoring.insert("provenance", [{ id, source: { kind: "derived", process: name, version }, licence, author: null, sourceUrl: null, inputs: [] }]);
  return id;
};

/** The Provenance of every link a rebuild of this process may replace: all derived ones but those of a process it keeps. */
const ownedProvenance = async (authoring: Authoring, { keeps = [] }: Process) =>
  new Set((await authoring.rows("provenance")).flatMap(({ id, source }) => (source.kind === "derived" && !keeps.includes(source.process) ? [id] : [])));

/**
 * Makes the derived links of `table` equal `desired`. A derived link made by this process version that still
 * means something desired stays, so an unchanged input writes nothing (the incremental rebuild). Every other
 * derived link goes, including those of an older process version (the full rebuild), except the links of a process
 * it `keeps`. Links are replaced, never retired.
 */
export const replaceDerivedLinks = async <N extends DerivedLinkTable>(authoring: Authoring, table: N, process: Process, desired: Desired<Link<N>>[]): Promise<Changes> => {
  const provenanceId = await provenanceFor(authoring, process);
  const owned = await ownedProvenance(authoring, process);
  const wanted = new Map(desired.map((d) => [meaning(d), d]));
  const kept = new Set<string>();
  const stale: string[] = [];
  for (const link of (await authoring.rows(table)) as Link<N>[]) {
    if (!owned.has(link.provenanceId)) continue;
    const current = link.provenanceId === provenanceId && wanted.has(meaning(link)) && !kept.has(meaning(link));
    if (current) kept.add(meaning(link));
    else stale.push(link.id);
  }
  const added = [...wanted].filter(([key]) => !kept.has(key)).map(([, d]) => ({ ...d, id: randomUUID(), approval: "approved" as const, retired: false, provenanceId }));
  for (const ids of chunks(stale)) await authoring.removeDerivedLinks(table, ids);
  for (const rows of chunks(added)) await authoring.insert(table, rows as never);
  return { added: added.length, removed: stale.length };
};
