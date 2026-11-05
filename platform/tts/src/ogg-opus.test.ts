import OpusScript from "opusscript";
import { describe, expect, it } from "vitest";
import { opusSeconds, readOgg } from "../test/ogg.ts";
import { encodeOggOpus, oggCrc } from "./ogg-opus.ts";

const tone = (sampleRate: number, seconds: number) =>
  Int16Array.from({ length: Math.round(sampleRate * seconds) }, (_, i) =>
    Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)),
  );

/** The first page of an Ogg Opus file ffmpeg wrote (libopus, bitexact). */
const FFMPEG_FIRST_PAGE = "4f676753000200000000000000000000000000000000435ec1a101134f7075734865616401013801c05d0000000000";

describe("oggCrc", () => {
  it("matches the checksum ffmpeg wrote on its own page", () => {
    const page = Buffer.from(FFMPEG_FIRST_PAGE, "hex");
    const written = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    expect(oggCrc(page)).toBe(written);
  });
});

describe("encodeOggOpus", () => {
  it("writes the Opus identification header with the input rate and libopus's pre-skip", () => {
    const [head, tags] = readOgg(encodeOggOpus({ sampleRate: 24_000, samples: tone(24_000, 0.1) }));
    const packet = head!.packets[0]!;
    expect(head!.flags).toBe(0x02);
    expect(packet.toString("latin1", 0, 8)).toBe("OpusHead");
    expect([packet[8], packet[9], packet.readUInt16LE(10), packet.readUInt32LE(12)]).toEqual([1, 1, 312, 24_000]);
    expect([packet.readInt16LE(16), packet[18], packet.length]).toEqual([0, 0, 19]);
    expect(tags!.packets[0]!.toString("latin1")).toBe("OpusTags\x12\0\0\0mojibun opusscript\0\0\0\0");
    expect([head!.granule, tags!.granule, tags!.flags]).toEqual([0n, 0n, 0]);
  });

  it("keeps exactly the input's length, though the last frame is padded", () => {
    const samples = tone(24_000, 1.234567);
    expect(opusSeconds(encodeOggOpus({ sampleRate: 24_000, samples }))).toBe(samples.length / 24_000);
  });

  it("splits long audio over pages of 255 packets, numbered in order, each with a valid checksum", () => {
    const pages = readOgg(encodeOggOpus({ sampleRate: 16_000, samples: tone(16_000, 12) }));
    const audio = pages.slice(2);
    expect(audio.map((p) => p.packets.length)).toEqual([255, 255, 90]);
    expect(audio.map((p) => p.granule)).toEqual([312n + 255n * 960n, 312n + 510n * 960n, 312n + 12n * 48_000n]);
    expect(audio.map((p) => p.flags)).toEqual([0, 0, 0x04]);
    expect(pages.map((p) => p.sequence)).toEqual([0, 1, 2, 3, 4]);
    expect(pages.every((p) => p.crcValid && p.serial === 0x6d6f6a69)).toBe(true);
  });

  it("encodes one packet per 20 ms frame, starting at the first sample", () => {
    const packets = (samples: number) =>
      readOgg(encodeOggOpus({ sampleRate: 24_000, samples: tone(24_000, samples / 24_000) })).slice(2).flatMap((p) => p.packets);
    expect(packets(480 * 10)).toHaveLength(10);
    expect(packets(480 * 10 + 1)).toHaveLength(11);
  });

  it("decodes back to audio of the same length", () => {
    const samples = tone(24_000, 0.5);
    const decoder = new OpusScript(48_000, 1);
    const packets = readOgg(encodeOggOpus({ sampleRate: 24_000, samples })).slice(2).flatMap((p) => p.packets);
    const decoded = packets.reduce((total, packet) => total + decoder.decode(packet).length / 2, 0);
    decoder.delete();
    expect(decoded).toBe(25 * 960);
  });

  it("laces packets of 255 bytes or more across segments", () => {
    const file = encodeOggOpus({ sampleRate: 48_000, samples: tone(48_000, 0.2) }, 256_000);
    const packets = readOgg(file).slice(2).flatMap((p) => p.packets);
    expect(Math.min(...packets.map((p) => p.length))).toBeGreaterThan(255);
    expect(packets).toHaveLength(10);
    expect(opusSeconds(file)).toBe(0.2);
  });

  it("gives the same bytes for the same input", () => {
    const pcm = { sampleRate: 24_000, samples: tone(24_000, 0.3) };
    expect(Buffer.from(encodeOggOpus(pcm)).equals(Buffer.from(encodeOggOpus(pcm)))).toBe(true);
  });

  it("rejects a rate Opus cannot encode", () => {
    expect(() => encodeOggOpus({ sampleRate: 44_100, samples: tone(44_100, 0.1) })).toThrow("44100 Hz");
  });
});
