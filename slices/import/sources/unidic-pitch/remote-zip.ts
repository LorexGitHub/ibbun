import { inflateRawSync } from "node:zlib";
import type { Fetch } from "../release.ts";

const END_OF_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const WIDE = 0xffffffff;
const ZIP64_EXTRA = 0x0001;
const DEFLATED = 8;
/** The end-of-directory record is the last 22 bytes, before a comment of at most 64 KiB. */
const TAIL = 65558;

type Entry = { method: number; compressedSize: number; offset: number };

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** `bytes` is a range spec such as `0-99` or `-65558`. UniDic's full zip is 3 GB, so it is never fetched whole. */
const range = async (fetchImpl: Fetch, url: string, bytes: string) => {
  const response = await fetchImpl(url, { headers: { range: `bytes=${bytes}`, "user-agent": "mojibun-import" } });
  if (response.status !== 206) throw new Error(`${url} answered ${response.status} to a range request for ${bytes}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** The values of a Zip64 extra field, in the order the format puts them. */
const zip64Values = (extra: Uint8Array) => {
  const v = view(extra);
  for (let at = 0; at < extra.length; at += 4 + v.getUint16(at + 2, true)) {
    if (v.getUint16(at, true) === ZIP64_EXTRA) return Array.from({ length: v.getUint16(at + 2, true) / 8 }, (_, i) => Number(v.getBigUint64(at + 4 + i * 8, true)));
  }
  return [];
};

/** Sizes and offset where the 32-bit field says 0xffffffff, the real value is the next Zip64 one: uncompressed size, compressed size, offset. */
const entryAt = (directory: Uint8Array, at: number) => {
  const v = view(directory);
  if (v.getUint32(at, true) !== DIRECTORY_ENTRY) throw new Error("the zip central directory is damaged");
  const [nameLength, extraLength, commentLength] = [v.getUint16(at + 28, true), v.getUint16(at + 30, true), v.getUint16(at + 32, true)];
  const name = text(directory.subarray(at + 46, at + 46 + nameLength));
  const wide = zip64Values(directory.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength));
  const next = () => {
    const value = wide.shift();
    if (value === undefined) throw new Error(`${name} needs Zip64 values its header does not carry`);
    return value;
  };
  const isWide = (field: number) => directory.subarray(at + field, at + field + 4).every((byte) => byte === 0xff);
  const resolve = (field: number) => (isWide(field) ? next() : v.getUint32(at + field, true));
  resolve(24);
  const compressedSize = resolve(20);
  const offset = resolve(42);
  const entry: Entry = { method: v.getUint16(at + 10, true), compressedSize, offset };
  return { name, entry, end: at + 46 + nameLength + extraLength + commentLength };
};

const directoryOf = async (fetchImpl: Fetch, url: string) => {
  const tail = await range(fetchImpl, url, `-${TAIL}`);
  const v = view(tail);
  const at = Buffer.from(tail).lastIndexOf(END_OF_DIRECTORY);
  if (at === -1) throw new Error(`${url} has no zip end-of-directory record`);
  const [size, offset] = [v.getUint32(at + 12, true), v.getUint32(at + 16, true)];
  if (size === WIDE || offset === WIDE) throw new Error(`${url} is a Zip64 archive with a Zip64 directory, which is not supported`);
  const directory = await range(fetchImpl, url, `${offset}-${offset + size - 1}`);
  const entries = new Map<string, Entry>();
  for (let next = 0; next < directory.length; ) {
    const { name, entry, end } = entryAt(directory, next);
    entries.set(name, entry);
    next = end;
  }
  return entries;
};

export type RemoteZip = {
  /** The deflated bytes of `name`, as stored. */
  deflated(name: string): Promise<Uint8Array>;
  /** The bytes of `name`, inflated. */
  read(name: string): Promise<Uint8Array>;
};

/**
 * One file at a time out of a zip behind a server that honours HTTP range requests. The central directory is read first;
 * `deflated` and `read` then fetch only the one entry. Entries must be deflated.
 */
export const openRemoteZip = async (fetchImpl: Fetch, url: string): Promise<RemoteZip> => {
  const entries = await directoryOf(fetchImpl, url);
  const deflated = async (name: string) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`${url} holds no ${name}`);
    if (entry.method !== DEFLATED) throw new Error(`${name} is not deflated (method ${entry.method})`);
    const header = await range(fetchImpl, url, `${entry.offset}-${entry.offset + 29}`);
    const v = view(header);
    if (v.getUint32(0, true) !== LOCAL_HEADER) throw new Error(`${name} has no local header where the directory says`);
    const start = entry.offset + 30 + v.getUint16(26, true) + v.getUint16(28, true);
    return range(fetchImpl, url, `${start}-${start + entry.compressedSize - 1}`);
  };
  return { deflated, read: async (name) => new Uint8Array(inflateRawSync(await deflated(name))) };
};
