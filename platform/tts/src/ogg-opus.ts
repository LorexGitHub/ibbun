// Encodes PCM as an Ogg Opus file (RFC 7845) with libopus compiled to
// WebAssembly, so no ffmpeg is needed on the worker or in CI. The output is
// byte-for-byte the same for the same input.
import OpusScript from "opusscript";
import type { Pcm } from "./wav.ts";

const OPUS_RATES = [8000, 12000, 16000, 24000, 48000] as const;
type OpusRate = (typeof OPUS_RATES)[number];

/** Granule positions always count samples at 48 kHz. */
const GRANULE_RATE = 48_000;
const FRAME_MS = 20;
/** Plenty for one voice; a 20 ms packet is about 80 bytes. */
const SPEECH_BITRATE = 32_000;
/** libopus's encoder delay for the audio application: 6.5 ms at 48 kHz. Players drop this many samples. */
const PRE_SKIP = 312;
/** One stream per file, so a fixed serial number keeps the output deterministic. */
const SERIAL = 0x6d6f6a69;
const VENDOR = "ibbun opusscript";

const BEGINNING_OF_STREAM = 0x02;
const END_OF_STREAM = 0x04;
const MAX_SEGMENTS = 255;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let r = n << 24;
  for (let bit = 0; bit < 8; bit++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
  return r >>> 0;
});

/** The Ogg page checksum: CRC-32 with polynomial 0x04c11db7, no reflection, initial value 0. */
export const oggCrc = (bytes: Uint8Array): number => {
  let crc = 0;
  for (const byte of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
  return crc;
};

/** Each packet's lacing values: runs of 255, then the remainder (0 when the length is a multiple of 255). */
const lacing = (packet: Uint8Array) => [...Array<number>(Math.floor(packet.length / 255)).fill(255), packet.length % 255];

type Page = { readonly packets: Uint8Array[]; readonly granule: bigint; readonly flags: number };

const writePage = ({ packets, granule, flags }: Page, sequence: number): Uint8Array => {
  const segments = packets.flatMap(lacing);
  const body = Buffer.concat(packets);
  const page = new Uint8Array(27 + segments.length + body.length);
  const view = new DataView(page.buffer);
  page.set(Buffer.from("OggS"));
  page[5] = flags;
  view.setBigInt64(6, granule, true);
  view.setUint32(14, SERIAL, true);
  view.setUint32(18, sequence, true);
  page[26] = segments.length;
  page.set(segments, 27);
  page.set(body, 27 + segments.length);
  view.setUint32(22, oggCrc(page), true);
  return page;
};

const opusHead = (inputRate: number) => {
  const head = Buffer.alloc(19);
  head.write("OpusHead");
  head[8] = 1; // version
  head[9] = 1; // channels
  head.writeUInt16LE(PRE_SKIP, 10);
  head.writeUInt32LE(inputRate, 12);
  return head; // output gain 0, channel mapping family 0
};

const opusTags = () => {
  const vendor = Buffer.from(VENDOR);
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write("OpusTags");
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  return tags; // no user comments
};

/** Splits PCM into 20 ms frames, padding the last with silence, and encodes each as one Opus packet. */
const encodePackets = ({ sampleRate, samples }: Pcm, bitrate: number): Buffer[] => {
  const frame = (sampleRate * FRAME_MS) / 1000;
  const encoder = new OpusScript(sampleRate as OpusRate); // mono, audio application: the defaults
  try {
    encoder.setBitrate(bitrate);
    const packets: Buffer[] = [];
    for (let at = 0; at < samples.length; at += frame) {
      const pcm = new Int16Array(frame);
      pcm.set(samples.subarray(at, at + frame));
      packets.push(Buffer.from(encoder.encode(Buffer.from(pcm.buffer), frame)));
    }
    return packets;
  } finally {
    encoder.delete();
  }
};

/**
 * Groups audio packets into pages of at most 255 segments, each with the granule
 * position its last packet ends on. The caller sets the last page's, where the
 * padded final frame ends early.
 */
const audioPages = (packets: Buffer[]): Page[] => {
  const perPacket = BigInt((GRANULE_RATE * FRAME_MS) / 1000);
  const pages: Page[] = [];
  let current: Buffer[] = [];
  let segments = 0;
  const flush = (ended: number) => {
    pages.push({ packets: current, granule: BigInt(PRE_SKIP) + BigInt(ended) * perPacket, flags: 0 });
    current = [];
    segments = 0;
  };
  packets.forEach((packet, index) => {
    const needed = lacing(packet).length;
    if (segments + needed > MAX_SEGMENTS) flush(index);
    current.push(packet);
    segments += needed;
  });
  flush(packets.length);
  return pages;
};

/** Encodes mono PCM at an Opus sample rate as an Ogg Opus file. */
export const encodeOggOpus = (pcm: Pcm, bitrate = SPEECH_BITRATE): Uint8Array => {
  if (!OPUS_RATES.includes(pcm.sampleRate as OpusRate)) throw new Error(`Opus cannot encode ${pcm.sampleRate} Hz`);
  const totalGranule = BigInt(PRE_SKIP) + (BigInt(pcm.samples.length) * BigInt(GRANULE_RATE)) / BigInt(pcm.sampleRate);
  const audio = audioPages(encodePackets(pcm, bitrate));
  const pages: Page[] = [
    { packets: [opusHead(pcm.sampleRate)], granule: 0n, flags: BEGINNING_OF_STREAM },
    { packets: [opusTags()], granule: 0n, flags: 0 },
    ...audio.slice(0, -1),
    { ...audio.at(-1)!, granule: totalGranule, flags: END_OF_STREAM },
  ];
  return Buffer.concat(pages.map(writePage));
};
