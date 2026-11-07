import { gunzipSync } from "node:zlib";

const BLOCK = 512;

const field = (header: Uint8Array, from: number, length: number) =>
  new TextDecoder().decode(header.subarray(from, from + length)).replace(/\0.*$/s, "");

/** The regular files of a gzipped tar archive. Enough for the one-file archives upstream publishes. */
export const untgz = (archive: Uint8Array): { name: string; bytes: Uint8Array }[] => {
  const tar = gunzipSync(archive);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (let at = 0; at + BLOCK <= tar.length; ) {
    const header = tar.subarray(at, at + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = parseInt(field(header, 124, 12).trim(), 8);
    const type = field(header, 156, 1);
    if (type === "0" || type === "") files.push({ name: field(header, 0, 100), bytes: tar.subarray(at + BLOCK, at + BLOCK + size) });
    at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
};
