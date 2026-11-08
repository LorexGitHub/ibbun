import { createHash } from "node:crypto";
import type { Dataset, Records } from "@mojibun/content-graph/authoring";

/** One upstream file as downloaded. */
export type RawFile = { name: string; bytes: Uint8Array };

/**
 * One upstream dataset: what its newest version is, how to fetch it and how to parse it into the
 * normalised records `applySnapshot()` takes. Parsing is the import slice's only job on a dataset
 * (import-pipeline.md#one-import-run). Each source lives in `sources/<source>/`.
 */
export type Source<D extends Dataset = Dataset> = {
  dataset: D;
  /** The newest upstream version, found without downloading the data. */
  latest(): Promise<string>;
  /** Downloads the files of `version`. */
  download(version: string): Promise<RawFile[]>;
  /** Async because a source may need a service, as Tatoeba needs Sudachi for its tokens. */
  parse(files: RawFile[]): Records[D][] | Promise<Records[D][]>;
};

/** One checksum for a set of files, whatever order they came in. */
export const checksum = (files: RawFile[]): string => {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) hash.update(file.name).update("\0").update(file.bytes);
  return hash.digest("hex");
};
