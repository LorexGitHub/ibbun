import { randomUUID } from "node:crypto";
import type { Authoring } from "@ibbun/content-graph/authoring";
import { EDITORIAL_LEVELS, VERSION, type EditorialLevel } from "./levels.ts";

const AUTHOR = `supervisor: editorial levels v${VERSION}`;

/** The one Provenance row for this version of the list, made on first use. */
const provenanceOf = async (authoring: Authoring) => {
  const found = (await authoring.rows("provenance")).find(({ source }) => source.kind === "authored" && source.by === AUTHOR);
  if (found) return found.id;
  const id = randomUUID();
  await authoring.insert("provenance", [{ id, source: { kind: "authored", by: AUTHOR }, licence: "ibbun", author: null, sourceUrl: null, inputs: [] }]);
  return id;
};

export type EditorialResult = { added: number; missing: string[] };

/**
 * Writes each decision as an approved Editorial level candidate on its JMdict Word, unless the Word already has
 * that one. Running it again adds nothing. A Word not in the graph is reported, not an error: JMdict may drop it.
 */
export const applyEditorialLevels = async (authoring: Authoring, levels: readonly EditorialLevel[] = EDITORIAL_LEVELS): Promise<EditorialResult> => {
  const words = new Map((await authoring.rows("sourceKey", { dataset: "jmdict" })).map((k) => [k.upstreamKey, k.recordId]));
  const provenanceId = await provenanceOf(authoring);
  const missing: string[] = [];
  let added = 0;
  for (const { jmdict, word, level } of levels) {
    const studyItemId = words.get(jmdict);
    if (!studyItemId) {
      missing.push(`${word} (JMdict ${jmdict})`);
      continue;
    }
    const existing = await authoring.rows("levelCandidate", { studyItemId, kind: "editorial", level, approval: "approved", retired: false });
    if (existing.length) continue;
    await authoring.insert("levelCandidate", [{ id: randomUUID(), studyItemId, level, kind: "editorial", approval: "approved", retired: false, provenanceId }]);
    added++;
  }
  return { added, missing };
};
