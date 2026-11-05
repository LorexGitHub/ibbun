/** 16-bit mono PCM samples and their rate, read from a WAV file. */
export type Pcm = { readonly sampleRate: number; readonly samples: Int16Array };

const PCM_FORMAT = 1;
const RIFF_HEADER = 12;
const CHUNK_HEADER = 8;

const ascii = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

/** Finds each chunk of a RIFF/WAVE file by its id. */
const chunks = (wav: Uint8Array) => {
  if (ascii(wav, 0) !== "RIFF" || ascii(wav, 8) !== "WAVE") throw new Error("not a WAV file");
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const found = new Map<string, Uint8Array>();
  for (let at = RIFF_HEADER; at + CHUNK_HEADER <= wav.length; ) {
    const size = view.getUint32(at + 4, true);
    found.set(ascii(wav, at), wav.subarray(at + CHUNK_HEADER, at + CHUNK_HEADER + size));
    at += CHUNK_HEADER + size + (size % 2);
  }
  return found;
};

/** Reads a VOICEVOX WAV: 16-bit mono PCM. Rejects any other encoding. */
export const readWav = (wav: Uint8Array): Pcm => {
  const found = chunks(wav);
  const fmt = found.get("fmt ");
  const data = found.get("data");
  if (!fmt || !data) throw new Error("WAV file has no fmt or data chunk");
  const format = new DataView(fmt.buffer, fmt.byteOffset, fmt.byteLength);
  const [encoding, channels, bits] = [format.getUint16(0, true), format.getUint16(2, true), format.getUint16(14, true)];
  if (encoding !== PCM_FORMAT || channels !== 1 || bits !== 16)
    throw new Error(`expected 16-bit mono PCM, got format ${encoding}, ${channels} channel(s), ${bits} bits`);
  const samples = new Int16Array(data.byteLength / 2);
  const pcm = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true);
  return { sampleRate: format.getUint32(4, true), samples };
};
