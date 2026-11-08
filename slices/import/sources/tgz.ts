import { gunzipSync } from "node:zlib";

const BLOCK = 512;

type Entry = { name: string; bytes: Uint8Array };

const field = (header: Uint8Array, from: number, length: number) =>
  new TextDecoder().decode(header.subarray(from, from + length)).replace(/\0.*$/s, "");

/** The entries from `at` on. Each one starts a block after the last one's data ends; an all-zero block ends the archive. */
const entriesFrom = (tar: Uint8Array, at: number): Entry[] => {
  const header = tar.subarray(at, at + BLOCK);
  if (header.length < BLOCK || header.every((byte) => byte === 0)) return [];
  const size = parseInt(field(header, 124, 12).trim(), 8);
  const type = field(header, 156, 1);
  const rest = entriesFrom(tar, at + BLOCK + Math.ceil(size / BLOCK) * BLOCK);
  return type === "0" || type === "" ? [{ name: field(header, 0, 100), bytes: tar.subarray(at + BLOCK, at + BLOCK + size) }, ...rest] : rest;
};

/** The regular files of a gzipped tar archive. Enough for the one-file archives upstream publishes. */
export const untgz = (archive: Uint8Array): Entry[] => entriesFrom(gunzipSync(archive), 0);
