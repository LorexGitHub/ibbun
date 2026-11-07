import { isDeepStrictEqual } from "node:util";

/** Keys a run adds, changes and loses against the previous snapshot of the same dataset. */
export type Diff = { added: string[]; changed: string[]; gone: string[] };

type Keyed = { key: string };

export const diff = <P extends Keyed, N extends Keyed>(previous: P[], next: N[]): Diff => {
  const before = new Map(previous.map((r) => [r.key, r]));
  const after = new Set(next.map((r) => r.key));
  return {
    added: next.filter((r) => !before.has(r.key)).map((r) => r.key),
    changed: next.filter((r) => before.has(r.key) && !isDeepStrictEqual(before.get(r.key), r)).map((r) => r.key),
    gone: previous.filter((r) => !after.has(r.key)).map((r) => r.key),
  };
};
