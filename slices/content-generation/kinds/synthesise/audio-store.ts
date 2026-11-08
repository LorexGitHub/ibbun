import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Object storage for audio files, keyed by `audioKeyOf`. A local volume in dev. */
export interface AudioStore {
  has(key: string): Promise<boolean>;
  put(key: string, audio: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export type AudioSpec = { kana: string; voice: number; engineVersion: string; speed: number };

/** hash(kana/accent string, voice, engine version, speed): the same speech always has the same key (listening.md#audio-files). */
export const audioKeyOf = ({ kana, voice, engineVersion, speed }: AudioSpec): string =>
  createHash("sha256").update(JSON.stringify([kana, voice, engineVersion, speed])).digest("hex");

export const createMemoryAudioStore = (): AudioStore => {
  const files = new Map<string, Uint8Array>();
  return {
    async has(key) {
      return files.has(key);
    },
    async put(key, audio) {
      files.set(key, audio);
    },
    async get(key) {
      return files.get(key) ?? null;
    },
  };
};

/** Files in a directory, named by key. Writing an existing key replaces it with the same bytes' worth of speech. */
export const createDirectoryAudioStore = (dir: string): AudioStore => {
  const read = (key: string) => readFile(join(dir, key)).then((b) => new Uint8Array(b), () => null);
  return {
    async has(key) {
      return (await read(key)) !== null;
    },
    async put(key, audio) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, key), audio);
    },
    get: read,
  };
};
