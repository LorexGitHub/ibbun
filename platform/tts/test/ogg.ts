// Reads an Ogg Opus file back for tests: its pages, packets and length.
import { expect } from "vitest";
import { oggCrc } from "../src/ogg-opus.ts";

export type OggPage = {
  flags: number;
  granule: bigint;
  serial: number;
  sequence: number;
  segments: number[];
  packets: Buffer[];
  crcValid: boolean;
};

export const readOgg = (file: Uint8Array): OggPage[] => {
  const bytes = Buffer.from(file);
  const pages: OggPage[] = [];
  for (let at = 0; at < bytes.length; ) {
    expect(bytes.toString("latin1", at, at + 4)).toBe("OggS");
    const count = bytes[at + 26]!;
    const segments = [...bytes.subarray(at + 27, at + 27 + count)];
    const length = 27 + count + segments.reduce((a, b) => a + b, 0);
    const page = Buffer.from(bytes.subarray(at, at + length));
    const crc = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    const packets: Buffer[] = [];
    let body = at + 27 + count;
    let size = 0;
    for (const segment of segments) {
      size += segment;
      if (segment < 255) {
        packets.push(bytes.subarray(body, body + size));
        body += size;
        size = 0;
      }
    }
    pages.push({
      flags: bytes[at + 5]!,
      granule: bytes.readBigInt64LE(at + 6),
      serial: bytes.readUInt32LE(at + 14),
      sequence: bytes.readUInt32LE(at + 18),
      segments,
      packets,
      crcValid: oggCrc(page) === crc,
    });
    at += length;
  }
  return pages;
};

/** Seconds of audio a player outputs: the last granule position less the pre-skip, at 48 kHz. */
export const opusSeconds = (file: Uint8Array): number => {
  const pages = readOgg(file);
  const head = pages[0]!.packets[0]!;
  expect(head.toString("latin1", 0, 8)).toBe("OpusHead");
  return Number(pages.at(-1)!.granule - BigInt(head.readUInt16LE(10))) / 48_000;
};
