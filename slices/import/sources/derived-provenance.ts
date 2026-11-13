import { randomUUID } from "node:crypto";
import type { Authoring } from "@ibbun/content-graph/authoring";

/** The one Provenance row for this version of a derived process, made on first use. */
export const derivedProvenance = async (authoring: Authoring, process: { name: string; version: string }) => {
  const found = (await authoring.rows("provenance")).find(({ source }) => source.kind === "derived" && source.process === process.name && source.version === process.version);
  if (found) return found.id;
  const id = randomUUID();
  await authoring.insert("provenance", [{ id, source: { kind: "derived", process: process.name, version: process.version }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] }]);
  return id;
};
