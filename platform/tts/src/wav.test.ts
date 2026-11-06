import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readWav } from "./wav.ts";

const chunk = (id: string, body: Buffer) => {
  const header = Buffer.alloc(8);
  header.write(id, "latin1");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body, Buffer.alloc(body.length % 2)]);
};

const fmt = ({ encoding = 1, channels = 1, rate = 24_000, bits = 16 } = {}) => {
  const body = Buffer.alloc(16);
  body.writeUInt16LE(encoding, 0);
  body.writeUInt16LE(channels, 2);
  body.writeUInt32LE(rate, 4);
  body.writeUInt16LE(bits, 14);
  return chunk("fmt ", body);
};

const pcm = (...samples: number[]) => {
  const body = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => body.writeInt16LE(s, i * 2));
  return chunk("data", body);
};

const wav = (...chunks: Buffer[]) => {
  const body = Buffer.concat([Buffer.from("WAVE"), ...chunks]);
  return new Uint8Array(Buffer.concat([Buffer.from("RIFF"), Buffer.from(new Uint32Array([body.length]).buffer), body]));
};

describe("readWav", () => {
  it("reads the samples and rate of 16-bit mono PCM", () => {
    const read = readWav(wav(fmt({ rate: 16_000 }), pcm(0, 1, -1, 32767, -32768)));
    expect(read.sampleRate).toBe(16_000);
    expect([...read.samples]).toEqual([0, 1, -1, 32767, -32768]);
  });

  it("skips other chunks, including an odd-sized one and its pad byte", () => {
    const read = readWav(wav(chunk("LIST", Buffer.from("odd")), fmt(), chunk("junk", Buffer.alloc(4)), pcm(7, -7)));
    expect([...read.samples]).toEqual([7, -7]);
  });

  it("reads an empty data chunk at the very end", () => {
    expect([...readWav(wav(fmt(), pcm())).samples]).toEqual([]);
  });

  it("reads a WAV that starts partway into a larger buffer", () => {
    const file = wav(fmt(), pcm(5, 6));
    const shifted = new Uint8Array(file.length + 3);
    shifted.set(file, 3);
    expect([...readWav(shifted.subarray(3)).samples]).toEqual([5, 6]);
  });

  it("reads the WAV VOICEVOX returns", () => {
    const read = readWav(readFileSync(new URL("./fixtures/neko.wav", import.meta.url)));
    expect(read.sampleRate).toBe(24_000);
    expect(read.samples.length).toBe((27_180 - 44) / 2);
  });

  it.each([
    ["stereo", fmt({ channels: 2 }), "2 channel(s)"],
    ["8-bit", fmt({ bits: 8 }), "8 bits"],
    ["floating point", fmt({ encoding: 3 }), "format 3"],
  ])("rejects %s audio", (_, format, message) => {
    expect(() => readWav(wav(format, pcm(0)))).toThrow(message);
  });

  it("rejects a WAV without a fmt or data chunk", () => {
    expect(() => readWav(wav(pcm(0)))).toThrow("no fmt or data chunk");
    expect(() => readWav(wav(fmt()))).toThrow("no fmt or data chunk");
  });

  it("rejects a file that is not RIFF/WAVE", () => {
    expect(() => readWav(new TextEncoder().encode('{"detail":"error"}'))).toThrow("not a WAV file");
    const avi = wav(fmt(), pcm(0));
    avi.set(new TextEncoder().encode("AVI "), 8);
    expect(() => readWav(avi)).toThrow("not a WAV file");
  });
});
